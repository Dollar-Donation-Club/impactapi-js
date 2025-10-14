// Main factory function and widget type
export { createWidget } from "./widget-client"
export type { Widget } from "./widget-client"

// Configuration types
export type {
	WidgetConfig,
	WidgetTemplate,
	WidgetStyleMode,
} from "@ddc/shared"

// Event types
export type {
	WidgetEventMap,
	ReadyEventData,
	ErrorEventData,
	AllocationsUpdatedEventData,
	ResizeEventData,
	DestroyedEventData,
} from "@ddc/shared"

// Data types
export type {
	SessionData,
	SessionType,
	Allocation,
	Campaign,
	ImpactCalculation,
} from "@ddc/shared"

// Error handling
export { WidgetError, WidgetErrorCode, WidgetErrors } from "@ddc/shared"
