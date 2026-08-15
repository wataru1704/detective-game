// 事件ファイル001のデータ定義

// 捜査で調べられる場所・人物。1つ調べるごとにpercentが加算され、
// 対応する容疑者(suspect)への疑いのヒントがhintとして手がかりログに残る。
const SPOTS = [
  {
    id: "footprint",
    label: "現場の靴跡を調べる",
    result: "地面に残った靴跡は大きめのサイズ。慌てて逃げた形跡がある。",
    percent: 15,
  },
  {
    id: "witnessA",
    label: "近くの店員に話を聞く",
    result: "「爆発の直前、白衣のような服を着た人が路地に入っていくのを見た」",
    percent: 20,
  },
  {
    id: "witnessB",
    label: "通行人に話を聞く",
    result: "「爆発の少し前、グライダーのような滑空音が上空から聞こえた」",
    percent: 15,
  },
  {
    id: "camera",
    label: "防犯カメラの映像を確認する",
    result: "映像には、解雇通知らしき封筒を握りしめた人物が映っていた。",
    percent: 25,
  },
  {
    id: "fragment",
    label: "落ちていた爆弾の破片を調べる",
    result: "破片からは工業用薬品の臭いがする。専門知識がないと扱えない代物だ。",
    percent: 25,
  },
];

// 容疑者。correctがtrueの人物が真犯人。
const SUSPECTS = [
  {
    id: "youth",
    name: "素行不良で噂の若者",
    desc: "夜な夜な繁華街をうろついている、地元では有名な不良少年。",
    correct: false,
  },
  {
    id: "researcher",
    name: "解雇された元研究員",
    desc: "化学メーカーを先月解雇されたばかりの技術者。行方がつかめていない。",
    correct: true,
  },
  {
    id: "performer",
    name: "近所で有名な奇術師",
    desc: "仕掛け花火や特殊効果を得意とする大道芸人。派手好きで知られる。",
    correct: false,
  },
];

// 対決パート（タイミングクリック）の設定値
const CONFRONT_CONFIG = {
  roundsNeeded: 2, // 3回中2回成功で確保成功
  totalRounds: 3,
  baseZoneWidthPercent: 18, // 解明度0%のときのゾーン幅(%)
  maxZoneWidthPercent: 45, // 解明度100%のときのゾーン幅(%)
  markerPeriodMs: 1400, // マーカーが端から端まで往復する周期
};
