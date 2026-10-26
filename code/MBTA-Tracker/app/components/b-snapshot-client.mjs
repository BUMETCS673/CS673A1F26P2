/*
 * AI-ASSISTED
 * Tool: OpenAI Codex
 * Model: Exact model not recorded
 * Prompt Summary: Keep shared train cards updated automatically while respecting visibility, cooldowns, failures and manual refresh.
 * AI Contribution: (~100%)
 * Estimate basis: Owner assessment, not measured code authorship.
 */

export function createSnapshotClient(fetchSnapshot, now = Date.now) {
  let state = { data: null, error: "", busy: false, notice: "", retryAt: 0 };
  let pending;
  let stopAutomatic;
  const listeners = new Set();
  const publish = (changes) => {
    state = { ...state, ...changes };
    for (const listener of listeners) listener(state);
  };
  async function load(manual = false) {
    if (pending) return pending;
    if (now() < state.retryAt) {
      publish({ notice: "Requests are paused until the retry time." });
      return state;
    }
    const data = state.data;
    if (
      data &&
      !state.error &&
      !data.predictionsError &&
      !data.alertsError &&
      !data.vehiclesError &&
      !data.schedulesError &&
      (!data.schedules || now() - data.schedulesCheckedAt < 300000) &&
      (!data.vehicles || now() - data.vehiclesCheckedAt < 30000) &&
      now() - data.predictionsCheckedAt < 30000 &&
      now() - data.alertsCheckedAt < 60000
    ) {
      if (manual) publish({ notice: "Already up to date." });
      return state;
    }
    publish({ busy: true, notice: "" });
    pending = Promise.resolve()
      .then(fetchSnapshot)
      .then((data) => {
        const retained = { ...data };
        // Preserve original timestamps; failed reads never renew saved data.
        for (const resource of ["predictions", "alerts", "vehicles", "schedules"]) {
          if (data[`${resource}Error`] && state.data?.[resource]) {
            retained[resource] = state.data[resource];
            retained[`${resource}CheckedAt`] = state.data[`${resource}CheckedAt`];
          }
        }
        publish({
          data: retained,
          error: "",
          retryAt: data.retryAt ?? 0,
          notice: manual
            ? data.predictionsError || data.alertsError || data.vehiclesError || data.schedulesError
              ? "Some MBTA data could not be refreshed."
              : data.reused
                ? "Already up to date."
                : "MBTA data updated."
            : "",
        });
      })
      .catch((error) => {
        publish({
          error: error.message,
          retryAt: error.retryAt || now() + 30000,
          notice: "Refresh failed. Previous data has not been renewed.",
        });
      })
      .finally(() => {
        pending = null;
        publish({ busy: false });
      });
    await pending;
    return state;
  }
  return {
    load,
    startAutoRefresh({ isVisible, subscribeVisibility, setTimer = setTimeout, clearTimer = clearTimeout }) {
      stopAutomatic?.();
      let stopped = false, ticking = false, timer;
      const tick = async () => {
        clearTimer(timer);
        if (stopped || !isVisible() || ticking) return;
        ticking = true;
        await load();
        ticking = false;
        if (!stopped && isVisible()) {
          timer = setTimer(tick, Math.max(30000, state.retryAt - now()));
        }
      };
      const onVisibility = () => {
        clearTimer(timer);
        if (isVisible()) void tick();
      };
      const unsubscribe = subscribeVisibility(onVisibility);
      const stop = () => {
        stopped = true;
        clearTimer(timer);
        unsubscribe();
        if (stopAutomatic === stop) stopAutomatic = undefined;
      };
      stopAutomatic = stop;
      void tick();
      return stop;
    },
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
