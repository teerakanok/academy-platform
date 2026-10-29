/* Generated from CYBERSKILLS Core profile-ui. Edit the Core source; run sync-to-host.mjs. Source SHA256: 764cda83446af4170ed7edec52739d4aa1b32de01c62c2cb3affdee2a9c80a7e */
export type { PrivateProfile as LearningProfile, ProfileSkill as LearningSkill, Evidence as LearningEvidence, PublicShare as SharedLearningProfile, TargetLevel as LearningJobLevel, SharePresentation as LearningSharePresentation } from './contracts';
import type { SetGoalCommand, CreateShareCommand, PrivateProfile, CreateShareResponse, RevokeShareResponse } from './contracts';
export interface ProfileActions {
  saveGoal(command: SetGoalCommand): Promise<PrivateProfile>;
  share(command: CreateShareCommand): Promise<CreateShareResponse>;
  revoke(id: string, requestId: string): Promise<RevokeShareResponse>;
  failureText(cause: unknown): string;
}
