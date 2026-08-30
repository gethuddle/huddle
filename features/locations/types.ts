export type AddressSuggestion = Readonly<{
  id: string;
  label: string;
  city: string;
  latitude: number;
  longitude: number;
}>;

export type PublicLocationKind = "venue" | "public_place";

export type PrivatePoint = Readonly<{
  latitude: number;
  longitude: number;
}>;

export type PrivateLocationSelection = Readonly<{
  addressText: string;
  point: PrivatePoint | null;
}>;
