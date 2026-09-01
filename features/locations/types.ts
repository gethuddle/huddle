export type AddressSuggestion = Readonly<{
  id: string;
  label: string;
  latitude: number;
  longitude: number;
}>;

export type LocationSearchPurpose = "origin" | "public_address" | "private_home";

export type PrivatePoint = Readonly<{
  latitude: number;
  longitude: number;
}>;

export type PrivateLocationSelection = Readonly<{
  addressText: string;
  point: PrivatePoint | null;
}>;
