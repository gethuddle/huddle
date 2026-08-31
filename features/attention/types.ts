export const attentionKinds = [
  "event_invitation",
  "attendance_request",
  "friend_request",
  "group_application",
  "group_invitation",
  "group_event_submission",
  "workspace_setup",
] as const;

export type AttentionKind = (typeof attentionKinds)[number];

export type AttentionItem = Readonly<{
  key: string;
  kind: AttentionKind;
  resourceId: string;
  href: string;
  title: string;
  description: string;
  createdAt: string;
}>;
