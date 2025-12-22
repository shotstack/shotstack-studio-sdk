export type Listener<TPayload = any> = (payload: TPayload) => void;

export type EventPayloadMap<TPayload = any> = Record<string, TPayload>;

export class EventEmitter<TEventPayloadMap extends EventPayloadMap = EventPayloadMap> {
	private readonly events: {
		[K in keyof TEventPayloadMap]?: Set<Listener<TEventPayloadMap[K]>>;
	};

	constructor() {
		this.events = {};
	}

	public on<TEventName extends keyof TEventPayloadMap>(name: TEventName, listener: Listener<TEventPayloadMap[TEventName]>): () => void {
		if (!this.events[name]) {
			this.events[name] = new Set();
		}

		this.events[name].add(listener);

		return () => this.off(name, listener);
	}

	public once<TEventName extends keyof TEventPayloadMap>(name: TEventName, listener: Listener<TEventPayloadMap[TEventName]>): () => void {
		const wrappedListener = ((payload: TEventPayloadMap[TEventName]) => {
			this.off(name, wrappedListener);
			listener(payload);
		}) as Listener<TEventPayloadMap[TEventName]>;

		return this.on(name, wrappedListener);
	}

	public off<TEventName extends keyof TEventPayloadMap>(name: TEventName, listener: Listener<TEventPayloadMap[TEventName]>): void {
		if (!this.events[name]) {
			return;
		}

		this.events[name].delete(listener);
		if (this.events[name].size > 0) {
			return;
		}

		delete this.events[name];
	}

	public clear(name: keyof TEventPayloadMap): void {
		delete this.events[name];
	}

	public emit<TEventName extends keyof TEventPayloadMap>(
		name: TEventName,
		...args: TEventPayloadMap[TEventName] extends void ? [] : [TEventPayloadMap[TEventName]]
	): void {
		if (!this.events[name]) {
			return;
		}

		const payload = args[0] as TEventPayloadMap[TEventName];
		for (const listener of this.events[name]) {
			listener(payload);
		}
	}
}
