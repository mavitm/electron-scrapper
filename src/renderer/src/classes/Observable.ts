export class Observable<T> {
  private subscribers: Set<(data: T) => void>

  constructor() {
    this.subscribers = new Set()
  }

  next(data: T): void {
    for (const fn of this.subscribers) fn(data)
  }

  subscribe(callback: (data: T) => void): { unsubscribe: () => void } {
    this.subscribers.add(callback)
    return {
      unsubscribe: () => this.subscribers.delete(callback)
    }
  }
}
