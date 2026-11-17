/**
 * Says when it is time to send again, for a sender that wants `perSecond` messages a second whatever the
 * frame rate. Time left over carries to the next frame, but never more than one interval, so a stalled
 * tab does not burst out a backlog when it wakes.
 */
export class SendRate {
  private readonly interval: number;
  private waited = 0;

  constructor(perSecond: number) {
    if (!(perSecond > 0)) {
      throw new Error(`SendRate: perSecond must be above zero, got ${String(perSecond)}`);
    }
    this.interval = 1 / perSecond;
  }

  /** Adds `dt` seconds; true when a message is due now. */
  due(dt: number): boolean {
    this.waited += dt;
    if (this.waited < this.interval) {
      return false;
    }
    this.waited = Math.min(this.waited - this.interval, this.interval);
    return true;
  }
}
