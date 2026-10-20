export interface Clock {
  now(): number;
}

export type TaskHandle = { readonly id: number };

/** Runs callbacks at a server-clock time. Injected so tests can control time. */
export interface Scheduler {
  at(time: number, fn: () => void): TaskHandle;
  cancel(handle: TaskHandle | undefined): void;
}

export const systemClock: Clock = { now: () => Date.now() };

export function createSystemScheduler(clock: Clock = systemClock): Scheduler {
  let next = 1;
  const timers = new Map<number, ReturnType<typeof setTimeout>>();
  return {
    at(time, fn) {
      const id = next++;
      const t = setTimeout(
        () => {
          timers.delete(id);
          fn();
        },
        Math.max(0, time - clock.now()),
      );
      timers.set(id, t);
      return { id };
    },
    cancel(handle) {
      if (!handle) return;
      const t = timers.get(handle.id);
      if (t) clearTimeout(t);
      timers.delete(handle.id);
    },
  };
}

/** Manually advanced clock + scheduler for deterministic tests. */
export function createFakeTime(start = 1_700_000_000_000) {
  let current = start;
  let next = 1;
  const tasks = new Map<number, { time: number; fn: () => void }>();
  const clock: Clock = { now: () => current };
  const scheduler: Scheduler = {
    at(time, fn) {
      const id = next++;
      tasks.set(id, { time, fn });
      return { id };
    },
    cancel(handle) {
      if (handle) tasks.delete(handle.id);
    },
  };
  /** Advances time, running due tasks in order (including ones they schedule). */
  function advance(ms: number) {
    const target = current + ms;
    for (;;) {
      let dueId: number | undefined;
      let due: { time: number; fn: () => void } | undefined;
      for (const [id, t] of tasks) {
        if (t.time <= target && (!due || t.time < due.time || (t.time === due.time && id < dueId!))) {
          dueId = id;
          due = t;
        }
      }
      if (!due || dueId === undefined) break;
      tasks.delete(dueId);
      current = Math.max(current, due.time);
      due.fn();
    }
    current = target;
  }
  return { clock, scheduler, advance, pending: () => tasks.size };
}
