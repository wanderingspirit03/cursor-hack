export interface StateConfig<S extends string> {
  onEnter?: () => void;
  onExit?: () => void;
  onUpdate?: (dt: number) => void;
  transitions: Partial<Record<string, S>>;
}

export class StateMachine<S extends string> {
  private states = new Map<S, StateConfig<S>>();
  private _current: S;

  constructor(initialState: S) {
    this._current = initialState;
  }

  get current(): S {
    return this._current;
  }

  addState(name: S, config: StateConfig<S>): void {
    this.states.set(name, config);
  }

  transition(event: string): boolean {
    const state = this.states.get(this._current);
    if (!state) return false;

    const next = state.transitions[event];
    if (!next) return false;

    state.onExit?.();
    this._current = next;
    this.states.get(next)?.onEnter?.();
    return true;
  }

  forceState(state: S): void {
    const current = this.states.get(this._current);
    current?.onExit?.();
    this._current = state;
    this.states.get(state)?.onEnter?.();
  }

  update(dt: number): void {
    this.states.get(this._current)?.onUpdate?.(dt);
  }
}
