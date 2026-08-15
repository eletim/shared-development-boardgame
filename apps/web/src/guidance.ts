import { type CardSummary, type CardUseMode, type PublicGameState } from "@sdb/protocol";

export type GuidanceFocus =
  | "setup"
  | "draft"
  | "card"
  | "mode"
  | "city"
  | "area"
  | "bonus"
  | "result"
  | "error";

export type GameGuidance = {
  focus: GuidanceFocus;
  eyebrow: string;
  title: string;
  detail: string;
  required: string[];
  optional: string[];
  target: string;
};

export type GuidanceContext = {
  state: PublicGameState;
  selectedCard: CardSummary | null;
  useMode: CardUseMode;
  selectedAreaId: string;
  secondAreaId: string;
  neutralAreaId: string;
  neutralPlacementCount: number;
  buildIntersectionId: string;
  hasError?: boolean;
};

const modeLabels: Record<CardUseMode, string> = {
  production: "生産/行動",
  scoring: "得点",
  basic: "基本取得",
};

export const deriveGameGuidance = ({
  state,
  selectedCard,
  useMode,
  selectedAreaId,
  secondAreaId,
  neutralAreaId,
  neutralPlacementCount,
  buildIntersectionId,
  hasError = false,
}: GuidanceContext): GameGuidance => {
  if (hasError) {
    return {
      focus: "error",
      eyebrow: "確認が必要",
      title: "直前の操作を処理できませんでした",
      detail: "エラー内容を確認し、合法なカード・交点・エリアを選び直してください。",
      required: ["エラー表示を確認"],
      optional: ["Undo / Resetで戻す"],
      target: "エラー表示",
    };
  }

  if (state.status === "ended" || state.phase === "ended") {
    return {
      focus: "result",
      eyebrow: "ゲーム終了",
      title: "結果を確認してください",
      detail: "勝者と各プレイヤーの最終得点を確認できます。次の操作は不要です。",
      required: ["結果確認"],
      optional: ["新規ゲームを開始"],
      target: "結果パネル",
    };
  }

  if (state.pendingWorldLevelBonus) {
    return {
      focus: "bonus",
      eyebrow: `Round ${state.round} / 世界Lv${state.pendingWorldLevelBonus.level}`,
      title: "獲得するボーナスキューブを選んでください",
      detail: `${state.pendingWorldLevelBonus.playerName}は赤・青・黄から1個選びます。選択後、手番を続行します。`,
      required: ["赤 / 青 / 黄のボーナスを1つ選択"],
      optional: [],
      target: "解禁ボーナス",
    };
  }

  if (state.phase === "draft") {
    return {
      focus: "draft",
      eyebrow: `Draft ${state.draftPickNumber} / 8`,
      title: "カードを1枚ドラフトしてください",
      detail: `${state.currentPlayerName ?? "現在プレイヤー"}は下のカードから1枚を選びます。ドラフト中はカード比較が主役です。`,
      required: ["ドラフトカードを1枚クリック"],
      optional: [],
      target: "ドラフトカード",
    };
  }

  if (!state.turnCardUsed) {
    if (!selectedCard) {
      return {
        focus: "card",
        eyebrow: `Round ${state.round} / ${state.currentPlayerName ?? "手番"}`,
        title: "手札から使うカードを選んでください",
        detail: "手札は識別しやすい最小表示です。カードを選ぶと用途と詳細がここに表示されます。",
        required: ["手札カードを選択"],
        optional: state.legal.canBuildCity ? ["カード使用前に都市建設できます"] : [],
        target: "手札",
      };
    }

    return {
      focus: "mode",
      eyebrow: `Round ${state.round} / ${state.currentPlayerName ?? "手番"}`,
      title: "カードの用途を選んでください",
      detail: `${selectedCard.name}を${modeLabels[useMode]}として使う準備ができています。用途を選び、カード使用ボタンで確定します。`,
      required: ["用途を選択", "カードを使用"],
      optional: state.legal.canBuildCity
        ? [buildIntersectionId ? `任意都市建設: ${buildIntersectionId}を選択中` : "任意都市建設: 盤面の光る交点を選択できます"]
        : [],
      target: "カード用途 / カードを使用",
    };
  }

  if (state.turnEndDevelopment?.type === "tricolor-city") {
    const selectedCount = [selectedAreaId, secondAreaId].filter(Boolean).length;
    return {
      focus: "area",
      eyebrow: "三色都市の開発",
      title: selectedCount < 2 ? `${selectedCount + 1}個目の配置先を選べます` : "選択した配置で手番終了できます",
      detail: "異なる最大2エリアへ1個ずつ置けます。置かずに終了する選択も合法です。",
      required: ["配置するなら光るHEXを選択", "選択分を置いて手番終了"],
      optional: ["0個 / 1個 / 2個配置を選べます", "すべてスキップ可能"],
      target: "開発可能HEX / 手番終了",
    };
  }

  if (state.turnEndDevelopment?.type === "neutral-development") {
    return {
      focus: "area",
      eyebrow: "中立開発",
      title: neutralAreaId ? "配置数と色を決めて中立開発を解決してください" : "対象エリアを選んでください",
      detail: `対象エリア1つへ最大2個置けます。現在の配置数は${neutralPlacementCount}個です。`,
      required: ["対象エリアを選択", "配置数と色を選択", "中立開発を解決"],
      optional: ["配置数0も選択可能", "中立化後の任意色取得を指定"],
      target: "対象HEX / 中立開発パネル",
    };
  }

  return {
    focus: "area",
    eyebrow: "カード使用後の手番終了",
    title: selectedAreaId ? "選択したエリアへ置いて手番終了できます" : "キューブを置くエリアを選んでください",
    detail: "カード使用後です。光るHEXへ1個置くか、置かずに手番を終了します。",
    required: ["光るHEXを選ぶ", "1個置いて手番終了"],
    optional: state.legal.canBuildCity
      ? ["置かずに手番終了できます", buildIntersectionId ? `任意都市建設: ${buildIntersectionId}を選択中` : "都市建設も任意で可能"]
      : ["置かずに手番終了できます"],
    target: "開発可能HEX / 手番終了",
  };
};
