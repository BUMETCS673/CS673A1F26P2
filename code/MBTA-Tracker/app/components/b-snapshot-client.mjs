export function createSnapshotClient(fetchSnapshot, now = Date.now) {
  let state = { data: null, error: "", busy: false, notice: "", retryAt: 0 };
  let pending;
  const listeners = new Set();
  const publish = (changes) => {
    state = { ...state, ...changes };
    for (const listener of listeners) listener(state);
  };
  async function load(manual = false) {
    if (pending) return pending;
    if (now() < state.retryAt) {
      publish({ notice: "Requests are paused. Try Refresh after the retry time." });
      return state;
    }
    const data = state.data;
    if (
      data &&
      !state.error &&
      !data.predictionsError &&
      !data.alertsError &&
      !data.vehiclesError &&
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
        publish({
          data,
          error: "",
          retryAt: data.retryAt ?? 0,
          notice: manual
            ? data.predictionsError || data.alertsError || data.vehiclesError
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
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
