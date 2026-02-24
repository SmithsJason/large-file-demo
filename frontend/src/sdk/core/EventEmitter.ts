/**
 * 事件发布订阅基础类
 * 统一前后端涉及到的基于各种事件的处理
 */
export class EventEmitter<T extends string> {
  private events: Map<T, Set<Function>>;

  constructor() {
    this.events = new Map();
  }

  /**
   * 监听事件
   * @param event 事件名
   * @param listener 监听器函数
   */
  on(event: T, listener: Function) {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    this.events.get(event)!.add(listener);
  }

  /**
   * 移除事件监听
   * @param event 事件名
   * @param listener 监听器函数
   */
  off(event: T, listener: Function) {
    if (!this.events.has(event)) {
      return;
    }
    this.events.get(event)!.delete(listener);
  }

  /**
   * 监听事件一次
   * @param event 事件名
   * @param listener 监听器函数
   */
  once(event: T, listener: Function) {
    const onceListener = (...args: any[]) => {
      listener(...args);
      this.off(event, onceListener);
    };
    this.on(event, onceListener);
  }

  /**
   * 触发事件
   * @param event 事件名
   * @param args 事件参数
   */
  emit(event: T, ...args: any[]) {
    if (!this.events.has(event)) {
      return;
    }
    this.events.get(event)!.forEach((listener) => {
      listener(...args);
    });
  }

  /**
   * 移除所有监听器
   */
  removeAllListeners() {
    this.events.clear();
  }

  /**
   * 获取事件监听器数量
   * @param event 事件名
   */
  listenerCount(event: T): number {
    return this.events.get(event)?.size || 0;
  }
}