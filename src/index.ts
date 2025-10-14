// Main factory functions and types
export { createWidget } from "./widget-client"
export type { Widget, BaseWidget } from "./widget-client"

// Re-export shared types for convenience
export type {
	WidgetConfig,
	IframeOptions,
	WidgetTemplate,
	WidgetStyleMode,
	BaseWidgetEventMap,
	WidgetEventMap,
	SessionData,
	Allocation,
	Campaign,
	SessionType,
	ReadyEventData,
	ErrorEventData,
	AllocationsUpdatedEventData,
	ResizeEventData,
	DestroyedEventData,
	ImpactCalculation,
} from "@ddc/shared"

// Re-export error types
export { WidgetError, WidgetErrorCode, WidgetErrors } from "@ddc/shared"

// Re-export utilities
export { debounce, throttle } from "@ddc/shared"
