import type {
	MessageFromParent,
	Allocation,
	SessionData,
	SessionType,
	WidgetEventMap,
	WidgetConfig,
	WidgetStyleMode,
	PreviewWidgetConfig,
	PreviewSessionConfig,
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
 * - portion_of_sales: Non-interactive - displays allocations from the API (set on backend)
 * - portion_of_sales_choice: Interactive - vendor pays, customer chooses allocations
 * - add_on: Interactive - customer pays and chooses allocations
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
	 * Returns the actual session type: "portion_of_sales", "portion_of_sales_choice", or "add_on"
	 */
	getType(): SessionType | null
}

/**
 * Creates a widget instance
 *
 * The widget will fetch session data and adapt its behavior based on the session type:
 * - portion_of_sales: Non-interactive - displays allocations from the API (set on backend)
 * - portion_of_sales_choice: Interactive - vendor pays, customer chooses allocations
 * - add_on: Interactive - customer pays and chooses allocations
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
 * // Check session type
 * const type = widget.getType() // "portion_of_sales", "portion_of_sales_choice", or "add_on"
 *
 * // Listen to allocation updates (for all types):
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
	return new WidgetClient(config) as Widget
}

/**
 * Creates a preview widget instance for demonstrating widget appearance and behavior
 *
 * Preview widgets use mock session data and do not persist changes to the API.
 * All interactions are client-side only.
 *
 * @example
 * ```ts
 * const previewWidget = createPreviewWidget({
 *   type: 'add_on',
 *   amount: 500,
 *   available_campaigns: ['yellow-rooms', 'trees-for-the-future'],
 *   styleMode: 'light'
 * })
 *
 * await previewWidget.mount('#preview-container')
 * ```
 */
export function createPreviewWidget(config: PreviewWidgetConfig): Widget {
	return new PreviewWidgetClient(config) as Widget
}

// ============================================================================
// Base Widget Client (Abstract)
// ============================================================================

abstract class BaseWidgetClient<TEventMap = WidgetEventMap> {
	protected iframe: HTMLIFrameElement | null = null
	protected container: HTMLElement | null = null
	protected eventHandlers = new Map<keyof TEventMap, Set<Function>>()
	protected widgetUrl: string
	protected targetOrigin: string
	protected styleMode?: WidgetStyleMode
	protected debug: boolean
	protected isWidgetReady = false
	protected pendingMessages: MessageFromParent[] = []
	protected sessionData: SessionData | null = null
	protected currentAllocations: Allocation[] = []
	protected messageListener: ((event: MessageEvent) => void) | null = null
	protected readyTimeoutId: ReturnType<typeof setTimeout> | null = null

	constructor(styleMode?: WidgetStyleMode) {
		this.widgetUrl = WIDGET_URL
		this.styleMode = styleMode

		// Auto-derive targetOrigin from widget URL for security
		try {
			const url = new URL(this.widgetUrl)
			this.targetOrigin = url.origin
		} catch (e) {
			console.error("[DDC Widget] Invalid WIDGET_URL, cannot determine targetOrigin")
			throw WidgetErrors.invalidConfig("Invalid WIDGET_URL format")
		}

		// Auto-enable debug mode in development
		this.debug = process.env.NODE_ENV !== "production"

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

		// Cancel pending waitForReady timeout to prevent spurious errors
		if (this.readyTimeoutId !== null) {
			clearTimeout(this.readyTimeoutId)
			this.readyTimeoutId = null
		}

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

	abstract getSessionId(): string

	getSessionData(): SessionData | null {
		return this.sessionData
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

	protected emit<K extends keyof TEventMap>(event: K, data: TEventMap[K]): void {
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

	protected abstract buildIframeUrl(): string
	protected abstract sendInitMessage(): void

	private createIframe(): void {
		if (!this.container) {
			throw WidgetErrors.mountFailed("Container not set")
		}

		this.iframe = document.createElement("iframe")
		this.iframe.src = this.buildIframeUrl()
		this.iframe.style.width = "100%"
		this.iframe.style.height = "100%"
		this.iframe.style.border = "none"
		this.iframe.title = "DDC Impact Widget"

		this.container.appendChild(this.iframe)

		this.iframe.addEventListener("load", () => {
			this.sendInitMessage()
		})

		this.log("Iframe created with URL:", this.iframe.src)
	}

	protected setupMessageListener(): void {
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

	protected sendMessageToWidget(message: MessageFromParent): void {
		if (!this.iframe?.contentWindow) {
			this.log("No iframe content window available")
			return
		}

		// Allow init and preview-init messages to go through even before ready
		if (!this.isWidgetReady && message.type !== "init" && message.type !== "preview-init") {
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
				resolve(this.getSessionId())
				return
			}

			const timeout = setTimeout(() => {
				cleanup()
				reject(WidgetErrors.timeout("Widget ready", TIMING.DEFAULT_TIMEOUT_MS))
			}, TIMING.DEFAULT_TIMEOUT_MS)

			// Store timeout ID so it can be cleared if widget is destroyed
			this.readyTimeoutId = timeout

			const readyHandler = (data: { sessionId: string; version: string }) => {
				cleanup()
				resolve(data.sessionId)
			}

			this.on("ready" as keyof TEventMap, readyHandler as (_data: TEventMap[keyof TEventMap]) => void)

			const cleanup = () => {
				clearTimeout(timeout)
				this.readyTimeoutId = null
				this.off("ready" as keyof TEventMap, readyHandler as (_data: TEventMap[keyof TEventMap]) => void)
			}
		})
	}

	protected log(message: string, data?: unknown): void {
		if (this.debug) {
			// eslint-disable-next-line no-console
			console.log(`[DDC Widget SDK] ${message}`, data !== undefined ? data : "")
		}
	}
}

// ============================================================================
// Real Widget Client
// ============================================================================

class WidgetClient extends BaseWidgetClient<WidgetEventMap> {
	private sessionId: string
	private secret: string

	constructor(config: WidgetConfig) {
		super(config.styleMode)

		// Validate required config
		if (!config.sessionId || typeof config.sessionId !== "string" || config.sessionId.trim() === "") {
			throw WidgetErrors.invalidConfig("sessionId must be a non-empty string")
		}
		if (!config.secret || typeof config.secret !== "string" || config.secret.trim() === "") {
			throw WidgetErrors.invalidConfig("secret must be a non-empty string")
		}

		this.sessionId = config.sessionId
		this.secret = config.secret
	}

	getSessionId(): string {
		return this.sessionId
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
		// Wait for session data to be updated
		await this.waitFor("session-updated", { timeout: TIMING.DEFAULT_TIMEOUT_MS })
		this.log("Session data refreshed")
	}

	protected buildIframeUrl(): string {
		const url = new URL(this.widgetUrl)
		url.searchParams.set("sessionId", this.sessionId)

		if (this.styleMode) {
			url.searchParams.set("styleMode", this.styleMode)
		}

		return url.toString()
	}

	protected sendInitMessage(): void {
		// Wait a bit for the widget's JS to be ready
		setTimeout(() => {
			this.log("Sending init message to widget")
			this.sendMessageToWidget({
				type: "init",
				secret: this.secret,
			})
		}, TIMING.INIT_MESSAGE_DELAY_MS)
	}
}

// ============================================================================
// Preview Widget Client
// ============================================================================

class PreviewWidgetClient extends BaseWidgetClient<WidgetEventMap> {
	private previewConfig: PreviewSessionConfig
	private previewSessionId: string

	constructor(config: PreviewWidgetConfig) {
		super(config.styleMode)

		// Extract session config from preview config
		if (config.type === "add_on") {
			this.previewConfig = {
				type: config.type,
				amount: config.amount,
				available_campaigns: config.available_campaigns,
			}
		} else if (config.type === "portion_of_sales_choice") {
			this.previewConfig = {
				type: config.type,
				amount: config.amount,
				available_campaigns: config.available_campaigns,
			}
		} else {
			this.previewConfig = {
				type: config.type,
				allocations: config.allocations,
			}
		}

		// Session ID will be set when widget sends "ready" event
		this.previewSessionId = ""
	}

	getSessionId(): string {
		return this.previewSessionId
	}

	getType(): SessionType | null {
		return this.sessionData?.type ?? null
	}

	getAllocations(): Allocation[] {
		return this.currentAllocations
	}

	async refresh(): Promise<void> {
		this.log("Preview mode: refresh is a no-op")
		// Preview doesn't support refresh - it's ephemeral
	}

	protected buildIframeUrl(): string {
		const url = new URL(this.widgetUrl)
		url.searchParams.set("previewMode", "true")

		if (this.styleMode) {
			url.searchParams.set("styleMode", this.styleMode)
		}

		return url.toString()
	}

	protected sendInitMessage(): void {
		// Wait a bit for the widget's JS to be ready
		setTimeout(() => {
			this.log("Sending preview-init message to widget")
			this.sendMessageToWidget({
				type: "preview-init",
				config: this.previewConfig,
			})
		}, TIMING.INIT_MESSAGE_DELAY_MS)
	}

	// Override setupMessageListener to capture session ID from ready event
	protected setupMessageListener(): void {
		// Call parent implementation
		super.setupMessageListener()

		// Add our own handler to capture session ID from ready event
		this.on("ready", (data: any) => {
			if (data && data.sessionId) {
				this.previewSessionId = data.sessionId
				this.log("Preview session ID set from widget:", this.previewSessionId)
			}
		})
	}
}
