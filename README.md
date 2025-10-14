# @ddc/sdk

JavaScript SDK for integrating the DDC Impact Widget into any website. This SDK provides a simple interface for embedding and interacting with the DDC Impact Widget through a secure iframe-based communication layer.

## Installation

```bash
npm install @ddc/sdk
# or
yarn add @ddc/sdk
# or
pnpm add @ddc/sdk
```

## Quick Start

```javascript
import { createWidget } from '@ddc/sdk'

// Create and mount the widget
const widget = createWidget({
  sessionId: 'your-session-id',
  secret: 'your-secret-key',
})

// Mount to a container
await widget.mount('#widget-container')

// Listen for events
widget.on('ready', (data) => {
  console.log('Widget ready:', data)
})

widget.on('allocations-updated', (data) => {
  console.log('Allocations:', data.allocations)
  console.log('Total amount:', data.totalAmount)
})
```

## Configuration

### WidgetConfig

```typescript
interface WidgetConfig {
  sessionId: string         // Session ID from your backend
  secret: string            // Secret key for authentication
  styleMode?: WidgetStyleMode // Widget appearance (optional)
}

type WidgetStyleMode = 'gradient' | 'solid' | 'light' | 'dark'
```

**Notes:**
- The widget URL is set at build time via the `WIDGET_URL` environment variable in `.env` and cannot be changed at runtime
- Debug logging is automatically enabled in development (`NODE_ENV !== 'production'`)
- The SDK handles all iframe configuration and postMessage security automatically

## API Reference

### `createWidget(config: WidgetConfig): Widget`

Creates a new widget instance.

### Widget Methods

#### `mount(container: HTMLElement | string): Promise<void>`

Mounts the widget iframe into the specified container. Accepts either a DOM element or a CSS selector string.

```javascript
// Using a selector
await widget.mount('#my-container')

// Using an element
const container = document.getElementById('my-container')
await widget.mount(container)
```

#### `destroy(): void`

Destroys the widget and cleans up all resources including event listeners and the iframe.

#### `isReady(): boolean`

Returns whether the widget has finished loading and is ready to use.

#### `getSessionId(): string`

Gets the unique session ID for this widget instance.

#### `getSessionData(): SessionData | null`

Gets the current session data including campaigns, allocations, and configuration.

#### `getAllocations(): Allocation[]`

Gets the current allocations for this session.

#### `getType(): 'readonly' | 'interactive' | null`

Gets the session type (readonly: displays preset allocations, interactive: user selects allocations).

#### `refresh(): Promise<void>`

Refetches session data from the API. Useful for getting updated allocations or campaign data.

### Event Handling

#### `on<K>(event: K, handler: (data) => void): this`

Registers an event listener. Returns the widget instance for chaining.

```javascript
widget
  .on('ready', (data) => console.log('Ready:', data))
  .on('error', (error) => console.error('Error:', error))
```

#### `off<K>(event: K, handler?: (data) => void): this`

Removes an event listener. If no handler is provided, removes all listeners for that event.

#### `waitFor<K>(event: K, options?: { timeout?: number }): Promise<EventData>`

Waits for a specific event to fire. Returns a promise that resolves with the event data.

```javascript
try {
  const readyData = await widget.waitFor('ready', { timeout: 5000 })
  console.log('Widget ready:', readyData)
} catch (error) {
  console.error('Timeout waiting for ready event')
}
```

### Events

The widget emits the following events:

#### `ready`
Fired when the widget has finished initializing.

```typescript
interface ReadyEventData {
  sessionId: string
  version: string
  type: SessionType
}
```

#### `allocations-updated`
Fired when allocations are updated (interactive mode only).

```typescript
interface AllocationsUpdatedEventData {
  allocations: Allocation[]
  totalAmount: number
}
```

#### `session-updated`
Fired when session data changes.

```typescript
type SessionData = SessionDataAddOn | SessionDataPortionOfSalesChoice | SessionDataPortionOfSales
```

#### `error`
Fired when an error occurs.

```typescript
interface ErrorEventData {
  message: string
  stack?: string
}
```

#### `resize`
Fired when the widget requests a size change.

```typescript
interface ResizeEventData {
  width?: number
  height?: number
}
```

#### `destroyed`
Fired when the widget is destroyed.

```typescript
interface DestroyedEventData {
  sessionId: string
}
```

## TypeScript Support

This package includes full TypeScript definitions. All types are exported for your convenience:

```typescript
import {
  createWidget,
  type Widget,
  type WidgetConfig,
  type Allocation,
  type Campaign,
  type SessionData,
  WidgetError,
  WidgetErrorCode
} from '@ddc/sdk'

const config: WidgetConfig = {
  sessionId: 'session-123',
  secret: 'secret-key',
  styleMode: 'gradient'
}

const widget: Widget = createWidget(config)
```

## Error Handling

The SDK exports error types for structured error handling:

```javascript
import { WidgetError, WidgetErrorCode, WidgetErrors } from '@ddc/sdk'

widget.on('error', (error) => {
  if (error instanceof WidgetError) {
    switch (error.code) {
      case WidgetErrorCode.CONTAINER_NOT_FOUND:
        console.error('Container element not found')
        break
      case WidgetErrorCode.SESSION_EXPIRED:
        console.error('Session has expired')
        break
      // ... handle other error codes
    }
  }
})
```

## Complete Example

```javascript
import { createWidget } from '@ddc/sdk'

// Create widget with custom configuration
const widget = createWidget({
  sessionId: 'your-session-id',
  secret: 'your-secret-key',
  styleMode: 'gradient'
})

// Mount and handle lifecycle
async function initWidget() {
  try {
    await widget.mount('#widget-container')
    console.log('Widget mounted successfully')
  } catch (error) {
    console.error('Failed to mount widget:', error)
  }
}

// Event handlers
widget
  .on('ready', (data) => {
    console.log('Widget ready:', data.sessionId)
    console.log('Session type:', data.type)
  })
  .on('allocations-updated', (data) => {
    console.log('New allocations:', data.allocations)
    console.log('Total amount:', data.totalAmount)
  })
  .on('error', (error) => {
    console.error('Widget error:', error)
  })

// Initialize
initWidget()

// Cleanup when done
window.addEventListener('beforeunload', () => {
  widget.destroy()
})
```

## Security

- All communication between the parent page and widget iframe uses secure postMessage
- Origin validation is performed on all messages
- Session secrets should be kept confidential and never exposed in client-side code
- HTTPS is required for production environments

## Browser Support

- Modern browsers (Chrome, Firefox, Safari, Edge)
- ES2020+ JavaScript features
- Requires support for ES modules

## License

MIT
