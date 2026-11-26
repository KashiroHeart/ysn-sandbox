// #16 Randactions: 難易度つきのステージを画面と別のスレッドで作る。
// main.js から { mode } を受け取り、{ mode, stage } を返す（stage.grid の中身は移譲する）。
importScripts('/examples/16/core.js');

self.addEventListener('message', (e) => {
  const R = self.Randactions;
  const { mode } = e.data;
  const stage = R.generateStage(mode, R.newSeed());
  self.postMessage({ mode, stage }, [stage.grid.buffer]);
});
