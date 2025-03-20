/**
 * Typed EventEmitter implementation for the Recording SDK
 */

type EventHandler = (...args: any[]) => void;

/**
 * Simple EventEmitter implementation with TypeScript support
 */
export class EventEmitter {
    private events: Map<string, EventHandler[]> = new Map();

    /**
     * Register an event handler
     * @param event Event name
     * @param handler Event handler function
     */
    public on(event: string, handler: EventHandler): this {
        if (!this.events.has(event)) {
            this.events.set(event, []);
        }

        this.events.get(event)?.push(handler);
        return this;
    }

    /**
     * Register a one-time event handler
     * @param event Event name
     * @param handler Event handler function
     */
    public once(event: string, handler: EventHandler): this {
        const onceHandler = (...args: any[]) => {
            this.off(event, onceHandler);
            handler(...args);
        };

        return this.on(event, onceHandler);
    }

    /**
     * Remove an event handler
     * @param event Event name
     * @param handler Event handler function
     */
    public off(event: string, handler: EventHandler): this {
        const handlers = this.events.get(event);

        if (handlers) {
            const index = handlers.indexOf(handler);

            if (index !== -1) {
                handlers.splice(index, 1);
            }

            if (handlers.length === 0) {
                this.events.delete(event);
            }
        }

        return this;
    }

    /**
     * Emit an event
     * @param event Event name
     * @param args Arguments to pass to handlers
     */
    protected emit(event: string, ...args: any[]): boolean {
        const handlers = this.events.get(event);

        if (!handlers) {
            return false;
        }

        handlers.forEach(handler => {
            try {
                handler(...args);
            } catch (error) {
                console.error(`Error in event handler for ${event}:`, error);
            }
        });

        return true;
    }

    /**
     * Remove all event handlers
     */
    public removeAllListeners(): this {
        this.events.clear();
        return this;
    }
}

/**
 * Type-safe EventEmitter with support for typed events
 */
export class TypedEventEmitter<Events extends Record<string, any>> extends EventEmitter {
    /**
     * Register an event handler with type safety
     */
    public on<E extends keyof Events>(event: E, handler: (data: Events[E]) => void): this {
        return super.on(event as string, handler as EventHandler);
    }

    /**
     * Register a one-time event handler with type safety
     */
    public once<E extends keyof Events>(event: E, handler: (data: Events[E]) => void): this {
        return super.once(event as string, handler as EventHandler);
    }

    /**
     * Remove an event handler with type safety
     */
    public off<E extends keyof Events>(event: E, handler: (data: Events[E]) => void): this {
        return super.off(event as string, handler as EventHandler);
    }

    /**
     * Emit a typed event
     */
    protected emit<E extends keyof Events>(event: E, data: Events[E]): boolean {
        return super.emit(event as string, data);
    }
} 