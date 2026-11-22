export type MoveNotation =
  | 'R'
  | "R'"
  | 'L'
  | "L'"
  | 'U'
  | "U'"
  | 'D'
  | "D'"
  | 'F'
  | "F'";

export type CubeFocusMode =
  | 'all'
  | 'centers'
  | 'white_cross'
  | 'first_layer'
  | 'middle_layer'
  | 'yellow_cross'
  | 'yellow_cross_sides'
  | 'yellow_corners_pos'
  | 'yellow_corners_orient';

export interface StageDefinition {
  id: number;
  shortTitle: string;
  fullTitle: string;
  analogy: string;
  goal: string;
  focus: CubeFocusMode;
  checkQuestion: string;
  defaultWhiteTop: boolean;
  demoMoves?: MoveNotation[];
  demoLabel?: string;
}

export interface MoveExplanation {
  notation: MoveNotation;
  russianName: string;
  plainDescription: string;
  axisHint: string;
}

export interface ChatMessage {
  id: string;
  role: 'instructor' | 'student';
  text: string;
  stage: number;
  demoMoves?: MoveNotation[];
  demoLabel?: string;
  cubeFocus?: CubeFocusMode;
  quickReplies?: string[];
  timestamp: string;
}

export interface TutorApiResponse {
  reply: string;
  currentStage: number;
  demoMoves?: MoveNotation[];
  demoLabel?: string;
  cubeFocus?: CubeFocusMode;
  quickReplies?: string[];
}
