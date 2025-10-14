import type {
	MessageFromParent,
	Allocation,
	SessionData,
	SessionType,
	WidgetEventMap,
	WidgetConfig,
} from "@ddc/shared"
import { WidgetError, WidgetErrors, isWidgetMessage, TIMING } from "@ddc/shared"
import { WIDGET_URL } from "./config"

/**
 * Base widget interface with common functionality shared across all widget types
 */
export interface BaseWidget<TEventMap> {
	/**
	 * Mounts the widget iframe into the specified container
	 * @param container - DOM element or CSS selector string
	 * @returns Promise that resolves when widget is ready
	 */
	mount(_container: HTMLElement | string): Promise<void>

	/**
	 * Destroys the widget and cleans up all resources
	 */
	destroy(): void

	/**
	 * Checks if the widget has finished loading and is ready to use
	 */
	isReady(): boolean

	/**
	 * Gets the unique session ID
	 */
	getSessionId(): string

	/**
	 * Gets the current session data including campaigns and configuration
	 */
	getSessionData(): SessionData | null

	/**
	 * Registers an event listener (chainable)
	 * @param event - Event name
	 * @param handler - Event handler function
	 */
	on<K extends keyof TEventMap>(_event: K, _handler: (_data: TEventMap[K]) => void): this

	/**
	 * Removes an event listener (chainable)
	 * @param event - Event name
	 * @param handler - Specific handler to remove, or omit to remove all
	 */
	off<K extends keyof TEventMap>(_event: K, _handler?: (_data: TEventMap[K]) => void): this

	/**
	 * Waits for a specific event to fire (promise-based)
	 * @param event - Event name
	 * @param options - Optional timeout configuration
	 * @returns Promise that resolves with event data
	 */
	waitFor<K extends keyof TEventMap>(_event: K, _options?: { timeout?: number }): Promise<TEventMap[K]>
}

/**
 * Widget interface
 *
 * Unified widget that adapts its behavior based on the session type:
 * - readonly: Displays allocations from the API (set on backend)
 * - interactive: Users select allocations within the widget (saved to API automatically)
 */
export interface Widget extends BaseWidget<WidgetEventMap> {
	/**
	 * Gets the current allocations
	 */
	getAllocations(): Allocation[]

	/**
	 * Refetches session data from the API
	 * Useful for getting updated allocations or campaign data
	 */
	refresh(): Promise<void>

	/**
	 * Gets the session type of this widget
	 */
	getType(): "readonly" | "interactive" | null
}

/**
 * Creates a widget instance
 *
 * The widget will fetch session data and adapt its behavior based on the interaction mode:
 * - readonly: Displays allocations from the API (set on backend)
 * - interactive: Users select allocations within the widget (saved to API automatically)
 *
 * @example
 * ```ts
 * const widget = createWidget({
 *   sessionId: 'session-123',
 *   secret: 'secret-key',
 *   debug: true
 * })
 *
 * await widget.mount('#widget-container')
 *
 * // Listen to allocation updates (for both modes):
 * widget.on('allocations-updated', (data) => {
 *   console.log('Allocations:', data.allocations)
 *   console.log('Total:', data.totalAmount)
 * })
 *
 * // Refresh session data at any time:
 * await widget.refresh()
 * ```
 */
export function createWidget(config: WidgetConfig): Widget {
	return new DDCWidgetClient(config) as Widget
}

// Internal implementation - NOT exported
class DDCWidgetClient<TEventMap = WidgetEventMap> {
	private iframe: HTMLIFrameElement | null = null
	private container: HTMLElement | null = null
	private eventHandlers = new Map<keyof TEventMap, Set<Function>>()
	private sessionId: string
	private secret: string
	private widgetUrl: string
	private targetOrigin: string
	private iframeOptions?: WidgetConfig["iframe"]
	private template?: WidgetConfig["template"]
	private debug: boolean
	private isWidgetReady = false
	private pendingMessages: MessageFromParent[] = []
	private sessionData: SessionData | null = null
	private currentAllocations: Allocation[] = []
	private messageListener: ((event: MessageEvent) => void) | null = null

	constructor(config: WidgetConfig) {
		// Validate required config
		if (!config.sessionId) {
			throw WidgetErrors.invalidConfig("sessionId is required")
		}
		if (!config.secret) {
			throw WidgetErrors.invalidConfig("secret is required")
		}

		this.sessionId = config.sessionId
		this.secret = config.secret
		this.widgetUrl = config.widgetUrl || WIDGET_URL

		// Warn if using default development URL
		if (!config.widgetUrl && this.widgetUrl.includes('localhost')) {
			console.warn(
				'[DDC Widget] Using default development widget URL. ' +
				'In production, provide widgetUrl in WidgetConfig to avoid errors.'
			)
		}

		// Set targetOrigin - default to the widget URL's origin for security
		// Using "*" allows any origin to intercept postMessages (security risk)
		if (config.targetOrigin) {
			this.targetOrigin = config.targetOrigin
			// Warn if explicitly using wildcard
			if (config.targetOrigin === "*") {
				console.warn(
					'[DDC Widget] Using wildcard "*" for targetOrigin is a security risk. ' +
					'Consider specifying the exact origin of your widget.'
				)
			}
		} else {
			// Extract origin from widgetUrl for safe default
			try {
				const url = new URL(this.widgetUrl)
				this.targetOrigin = url.origin
			} catch (e) {
				console.error('[DDC Widget] Invalid widgetUrl, cannot determine targetOrigin')
				throw WidgetErrors.invalidConfig('Invalid widgetUrl format')
			}
		}
		this.iframeOptions = config.iframe
		this.template = config.template
		this.debug = config.debug || false

		this.setupMessageListener()
	}

	async mount(container: HTMLElement | string): Promise<void> {
		// If already mounted, destroy first (allows remounting)
		if (this.iframe) {
			this.log("Widget already mounted, destroying previous instance")
			this.destroy()
		}

		// Resolve container
		const containerEl =
			typeof container === "string"
				? document.getElementById(container) || document.querySelector(container)
				: container

		if (!containerEl) {
			throw WidgetErrors.containerNotFound(typeof container === "string" ? container : "[HTMLElement]")
		}

		this.container = containerEl

		try {
			this.createIframe()
			// Wait for widget to be ready
			await this.waitForReady()
		} catch (error) {
			const widgetError =
				error instanceof WidgetError ? error : WidgetErrors.mountFailed("Failed to mount widget", error as Error)
			this.log("Error mounting widget:", widgetError)
			throw widgetError
		}
	}

	destroy(): void {
		this.log("Destroying widget")

		// Send destroy message to widget
		if (this.iframe?.contentWindow && this.isWidgetReady) {
			this.sendMessageToWidget({
				type: "destroy",
			})
		}

		// Remove iframe from DOM
		if (this.iframe?.parentNode) {
			this.iframe.parentNode.removeChild(this.iframe)
		}

		// Remove message listener to prevent memory leak
		if (this.messageListener) {
			window.removeEventListener("message", this.messageListener)
			this.messageListener = null
		}

		// Clear state
		this.iframe = null
		this.container = null
		this.isWidgetReady = false
		this.pendingMessages = []
		// Note: We keep eventHandlers in case of remounting
	}

	isReady(): boolean {
		return this.isWidgetReady
	}

	getSessionId(): string {
		return this.sessionId
	}

	getSessionData(): SessionData | null {
		return this.sessionData
	}

	getType(): SessionType | null {
		return this.sessionData?.type ?? null
	}

	getAllocations(): Allocation[] {
		return this.currentAllocations
	}

	async refresh(): Promise<void> {
		this.log("Refreshing session data...")
		// Send refresh message to widget iframe
		this.sendMessageToWidget({
			type: "refresh",
		})
		// Wait for session data to be updated (session-updated is in BaseWidgetEventMap)
		await this.waitFor("session-updated" as keyof TEventMap, { timeout: TIMING.DEFAULT_TIMEOUT_MS })
		this.log("Session data refreshed")
	}

	waitFor<K extends keyof TEventMap>(event: K, options?: { timeout?: number }): Promise<TEventMap[K]> {
		return new Promise((resolve, reject) => {
			const timeout = options?.timeout || TIMING.DEFAULT_TIMEOUT_MS

			const timer = setTimeout(() => {
				this.off(event, handler as (_data: TEventMap[K]) => void)
				reject(WidgetErrors.timeout(`waitFor('${String(event)}')`, timeout))
			}, timeout)

			const handler = (data: TEventMap[K]) => {
				clearTimeout(timer)
				this.off(event, handler as (_data: TEventMap[K]) => void)
				resolve(data)
			}

			this.on(event, handler as (_data: TEventMap[K]) => void)
		})
	}

	on<K extends keyof TEventMap>(event: K, handler: (_data: TEventMap[K]) => void): this {
		if (!this.eventHandlers.has(event)) {
			this.eventHandlers.set(event, new Set())
		}
		const handlers = this.eventHandlers.get(event)
		if (handlers) {
			handlers.add(handler)
		}
		this.log(`Registered handler for event: ${String(event)}`)
		return this // Chainable
	}

	off<K extends keyof TEventMap>(event: K, handler?: (_data: TEventMap[K]) => void): this {
		if (!handler) {
			// Remove all handlers for this event
			this.eventHandlers.delete(event)
			this.log(`Removed all handlers for event: ${String(event)}`)
		} else {
			// Remove specific handler
			const handlers = this.eventHandlers.get(event)
			if (handlers) {
				handlers.delete(handler)
				this.log(`Removed specific handler for event: ${String(event)}`)
			}
		}
		return this
	}

	private emit<K extends keyof TEventMap>(event: K, data: TEventMap[K]): void {
		const handlers = this.eventHandlers.get(event)
		if (handlers && handlers.size > 0) {
			this.log(`Emitting event: ${String(event)}`, data)
			handlers.forEach(handler => {
				try {
					handler(data)
				} catch (error) {
					this.log(`Error in event handler for ${String(event)}:`, error)
				}
			})
		}
	}

	private createIframe(): void {
		if (!this.container) {
			throw WidgetErrors.mountFailed("Container not set")
		}

		this.iframe = document.createElement("iframe")

		// Construct URL properly handling existing query params
		const url = new URL(this.widgetUrl)
		url.searchParams.set("sessionId", this.sessionId)

		// Add template configuration to URL if provided
		if (this.template?.styleMode) {
			url.searchParams.set("styleMode", this.template.styleMode)
		}

		this.iframe.src = url.toString()

		this.iframe.style.width = "100%"
		this.iframe.style.height = "100%"
		this.iframe.style.border = "none"

		// Apply iframe options if provided
		if (this.iframeOptions) {
			if (this.iframeOptions.sandbox) {
				this.iframe.setAttribute("sandbox", this.iframeOptions.sandbox)
			}
			if (this.iframeOptions.allow) {
				this.iframe.setAttribute("allow", this.iframeOptions.allow)
			}
			if (this.iframeOptions.title) {
				this.iframe.title = this.iframeOptions.title
			}
		}

		this.container.appendChild(this.iframe)

		this.iframe.addEventListener("load", () => {
			this.sendInitMessage()
		})

		this.log("Iframe created with URL:", this.iframe.src)
	}

	private sendInitMessage(): void {
		// Wait a bit for the widget's JS to be ready
		setTimeout(() => {
			this.log("Sending init message to widget")
			this.sendMessageToWidget({
				type: "init",
				secret: this.secret,
			})
		}, TIMING.INIT_MESSAGE_DELAY_MS)
	}

	private setupMessageListener(): void {
		// Store the listener so we can remove it later in destroy()
		this.messageListener = (event: MessageEvent) => {
			if (!this.iframe || event.source !== this.iframe.contentWindow) {
				return
			}

			try {
				// Validate message structure before processing
				if (!isWidgetMessage(event.data)) {
					this.log("Received invalid message format, ignoring")
					return
				}

				const message = event.data

				this.log("Received message:", message)

				// Handle ready state
				if (message.type === "ready") {
					this.isWidgetReady = true
					this.processPendingMessages()
				}

				// Handle resize messages internally
				if (message.type === "resize") {
					this.handleResize(message.payload as { width?: number; height?: number })
				}

				// Track session updates
				if (message.type === "session-updated") {
					this.sessionData = message.payload as SessionData
					this.currentAllocations = this.sessionData.allocations || []
				}

				// Track allocations updates
				if (message.type === "allocations-updated") {
					const allocationsData = message.payload as { allocations: Allocation[]; totalAmount: number }
					this.currentAllocations = allocationsData.allocations
				}

				// Emit to user handlers - TypeScript will enforce correct event types at usage
				this.emit(message.type as any, message.payload as any)
			} catch (error) {
				this.log("Error processing message:", error)
			}
		}

		window.addEventListener("message", this.messageListener)
	}

	private handleResize(data: { width?: number; height?: number }): void {
		if (!this.iframe) return

		if (data.height !== undefined) {
			this.iframe.style.height = `${data.height}px`
			this.log("Iframe height updated to:", data.height)
		}

		if (data.width !== undefined) {
			this.iframe.style.width = `${data.width}px`
			this.log("Iframe width updated to:", data.width)
		}
	}

	private processPendingMessages(): void {
		while (this.pendingMessages.length > 0 && this.isWidgetReady) {
			const message = this.pendingMessages.shift()
			if (message) {
				this.sendMessageToWidget(message)
			}
		}
	}

	private sendMessageToWidget(message: MessageFromParent): void {
		if (!this.iframe?.contentWindow) {
			this.log("No iframe content window available")
			return
		}

		// Allow init messages to go through even before ready
		if (!this.isWidgetReady && message.type !== "init") {
			this.pendingMessages.push(message)
			this.log("Widget not ready, queuing message:", message)
			return
		}

		this.log("Sending message to widget:", message)
		this.iframe.contentWindow.postMessage(message, this.targetOrigin)
	}

	private waitForReady(): Promise<string> {
		return new Promise((resolve, reject) => {
			if (this.isWidgetReady) {
				resolve(this.sessionId)
				return
			}

			const timeout = setTimeout(() => {
				cleanup()
				reject(WidgetErrors.timeout("Widget ready", TIMING.DEFAULT_TIMEOUT_MS))
			}, TIMING.DEFAULT_TIMEOUT_MS)

			const readyHandler = (data: { sessionId: string; version: string }) => {
				cleanup()
				resolve(data.sessionId)
			}

			this.on("ready" as keyof TEventMap, readyHandler as (_data: TEventMap[keyof TEventMap]) => void)

			const cleanup = () => {
				clearTimeout(timeout)
				this.off("ready" as keyof TEventMap, readyHandler as (_data: TEventMap[keyof TEventMap]) => void)
			}
		})
	}

	private log(message: string, data?: unknown): void {
		if (this.debug) {
			// eslint-disable-next-line no-console
			console.log(`[DDC Widget SDK] ${message}`, data !== undefined ? data : "")
		}
	}
}
