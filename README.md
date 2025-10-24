# @dollardonationclub/impactapi-js

JavaScript SDK for integrating the DDC Impact Widget into any website. This SDK provides a simple interface for embedding and interacting with the DDC Impact Widget through a secure iframe-based communication layer.

## Installation

```bash
npm install @dollardonationclub/impactapi-js
# or
yarn add @dollardonationclub/impactapi-js
# or
pnpm add @dollardonationclub/impactapi-js
```

## Quick Start

### Production Widget (with API session)

```javascript
import { createWidget } from '@dollardonationclub/impactapi-js'

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

### Preview Widget (client-side demo)

```javascript
import { createPreviewWidget } from '@dollardonationclub/impactapi-js'

// Create a preview widget for demos/testing - no API calls
const previewWidget = createPreviewWidget({
  type: 'add_on',
  amount: 500, // $5.00 in cents
  available_campaigns: ['yellow-rooms', 'trees-for-the-future'],
  styleMode: 'light'
})

await previewWidget.mount('#preview-container')
```

## Configuration

### WidgetConfig (Production)

```typescript
interface WidgetConfig {
  sessionId: string         // Session ID from your backend
  secret: string            // Secret key for authentication
  styleMode?: WidgetStyleMode // Widget appearance (optional)
}

type WidgetStyleMode = 'gradient' | 'solid' | 'light' | 'dark'
```

**Notes:**
- The widget URL is configured at build time and points to the DDC Impact Widget iframe
- Debug logging is automatically enabled in development (`NODE_ENV !== 'production'`)
- The SDK handles all iframe configuration and postMessage security automatically

### PreviewWidgetConfig (Demo/Testing)

Preview widgets allow you to demo the widget functionality without making API calls. Perfect for testing, documentation, or showcasing the widget before integration.

```typescript
type PreviewWidgetConfig =
  | PreviewWidgetConfigAddOn
  | PreviewWidgetConfigPortionOfSalesChoice
  | PreviewWidgetConfigPortionOfSales

// Customer-paid donation: customer pays and chooses
interface PreviewWidgetConfigAddOn {
  type: 'add_on'
  amount: number                    // Amount in cents
  available_campaigns: string[]     // Campaign slugs to show
  styleMode?: WidgetStyleMode       // Widget appearance
}

// Vendor-paid with choice: vendor pays, customer chooses
interface PreviewWidgetConfigPortionOfSalesChoice {
  type: 'portion_of_sales_choice'
  amount: number                    // Amount in cents
  available_campaigns: string[]     // Campaign slugs to show
  styleMode?: WidgetStyleMode
}

// Vendor-paid, pre-allocated: displays fixed allocations
interface PreviewWidgetConfigPortionOfSales {
  type: 'portion_of_sales'
  allocations: Array<{
    campaign_identifier: string     // Campaign slug
    amount: number                  // Amount in cents
  }>
  styleMode?: WidgetStyleMode
}
```

**Notes:**
- Preview widgets operate entirely client-side - no API calls are made
- Changes are not persisted to any backend
- The widget fetches campaign data from the production API to display real campaign information
- Ideal for demos, testing, and documentation

## API Reference

### `createWidget(config: WidgetConfig): Widget`

Creates a new production widget instance that connects to your backend session.

### `createPreviewWidget(config: PreviewWidgetConfig): Widget`

Creates a preview widget instance for demos and testing. Returns the same `Widget` interface as `createWidget`, but operates entirely client-side without persisting changes to the API.

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

#### `getType(): SessionType | null`

Gets the session type. Returns one of:
- `"portion_of_sales"` - Non-interactive: displays allocations from the API (set on backend)
- `"portion_of_sales_choice"` - Interactive: vendor pays, customer chooses allocations
- `"add_on"` - Interactive: customer pays and chooses allocations

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

## Preview Widget Examples

Preview widgets are perfect for demos, testing, and showcasing the widget before full integration.

### Add-On Widget (Customer Pays)

```javascript
import { createPreviewWidget } from '@dollardonationclub/impactapi-js'

const widget = createPreviewWidget({
  type: 'add_on',
  amount: 500, // $5.00 in cents
  available_campaigns: ['yellow-rooms', 'trees-for-the-future'],
  styleMode: 'gradient'
})

await widget.mount('#container')
```

### Portion of Sales Choice (Vendor Pays, Customer Chooses)

```javascript
const widget = createPreviewWidget({
  type: 'portion_of_sales_choice',
  amount: 1000, // $10.00 in cents
  available_campaigns: ['yellow-rooms', 'trees-for-the-future', 'plastic-fischer'],
  styleMode: 'light'
})

await widget.mount('#container')
```

### Portion of Sales (Vendor Pays, Pre-Allocated)

```javascript
const widget = createPreviewWidget({
  type: 'portion_of_sales',
  allocations: [
    { campaign_identifier: 'yellow-rooms', amount: 300 },
    { campaign_identifier: 'trees-for-the-future', amount: 200 }
  ],
  styleMode: 'dark'
})

await widget.mount('#container')
```

## TypeScript Support

This package includes full TypeScript definitions. All types are exported for your convenience:

```typescript
import {
  createWidget,
  createPreviewWidget,
  type Widget,
  type WidgetConfig,
  type PreviewWidgetConfig,
  type Allocation,
  type Campaign,
  type SessionData,
  WidgetError,
  WidgetErrorCode
} from '@dollardonationclub/impactapi-js'

// Production widget
const config: WidgetConfig = {
  sessionId: 'session-123',
  secret: 'secret-key',
  styleMode: 'gradient'
}
const widget: Widget = createWidget(config)

// Preview widget
const previewConfig: PreviewWidgetConfig = {
  type: 'add_on',
  amount: 500,
  available_campaigns: ['yellow-rooms'],
  styleMode: 'light'
}
const previewWidget: Widget = createPreviewWidget(previewConfig)
```

## Error Handling

The SDK exports error types for structured error handling:

```javascript
import { WidgetError, WidgetErrorCode, WidgetErrors } from '@dollardonationclub/impactapi-js'

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
import { createWidget } from '@dollardonationclub/impactapi-js'

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
