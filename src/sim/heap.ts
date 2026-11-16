export interface HeapItem {
  readonly index: number;
  readonly priority: number;
}

/** Children per node in a binary heap. */
const BRANCHING = 2;

function parentOf(i: number): number {
  return Math.floor((i - 1) / BRANCHING);
}

/** Binary min-heap keyed on `priority`, for Dijkstra over the nav grid. */
export class MinHeap {
  private readonly items: HeapItem[] = [];

  get size(): number {
    return this.items.length;
  }

  push(item: HeapItem): void {
    this.items.push(item);
    this.siftUp(this.items.length - 1);
  }

  pop(): HeapItem | undefined {
    const top = this.items[0];
    const last = this.items.pop();
    if (last === undefined || this.items.length === 0) return top;
    this.items[0] = last;
    this.siftDown(0);
    return top;
  }

  private less(a: number, b: number): boolean {
    const x = this.items[a];
    const y = this.items[b];
    return x !== undefined && y !== undefined && x.priority < y.priority;
  }

  private swap(a: number, b: number): void {
    const x = this.items[a];
    const y = this.items[b];
    if (x === undefined || y === undefined) return;
    this.items[a] = y;
    this.items[b] = x;
  }

  private siftUp(start: number): void {
    let i = start;
    while (i > 0 && this.less(i, parentOf(i))) {
      this.swap(i, parentOf(i));
      i = parentOf(i);
    }
  }

  private smallestOf(i: number): number {
    const left = i * BRANCHING + 1;
    const right = left + 1;
    const best = this.less(left, i) ? left : i;
    return this.less(right, best) ? right : best;
  }

  private siftDown(start: number): void {
    let i = start;
    let next = this.smallestOf(i);
    while (next !== i) {
      this.swap(i, next);
      i = next;
      next = this.smallestOf(i);
    }
  }
}
