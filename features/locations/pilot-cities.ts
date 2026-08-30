import { z } from "zod";

import type { PrivatePoint } from "@/features/locations/types";

export const reviewedPilotCitySlugSchema = z.enum([
  "jerusalem",
  "tel-aviv-yafo",
  "haifa",
  "rishon-lezion",
  "petah-tikva",
  "netanya",
  "ashdod",
  "bnei-brak",
  "holon",
  "beer-sheva",
  "ramat-gan",
  "rehovot",
  "ashkelon",
]);

export type ReviewedPilotCitySlug = z.infer<typeof reviewedPilotCitySlugSchema>;

type ReviewedPilotCityEntry = Readonly<{
  slug: ReviewedPilotCitySlug;
  label: string;
  center: Readonly<PrivatePoint>;
}>;

/**
 * Deliberate pilot duplication of the 13 active entries in
 * 20260829003000_hosted_city_catalog.sql. The private-pin camera consumes only
 * this reviewed public catalog; it never accepts caller-provided coordinates.
 */
export const REVIEWED_PILOT_CITIES = [
  {
    slug: "jerusalem",
    label: "Jerusalem",
    center: { latitude: 31.76904, longitude: 35.21633 },
  },
  {
    slug: "tel-aviv-yafo",
    label: "Tel Aviv-Yafo",
    center: { latitude: 32.08088, longitude: 34.78057 },
  },
  {
    slug: "haifa",
    label: "Haifa",
    center: { latitude: 32.81303, longitude: 34.99928 },
  },
  {
    slug: "rishon-lezion",
    label: "Rishon LeZion",
    center: { latitude: 31.97102, longitude: 34.78939 },
  },
  {
    slug: "petah-tikva",
    label: "Petah Tikva",
    center: { latitude: 32.08707, longitude: 34.88747 },
  },
  {
    slug: "netanya",
    label: "Netanya",
    center: { latitude: 32.33294, longitude: 34.85917 },
  },
  {
    slug: "ashdod",
    label: "Ashdod",
    center: { latitude: 31.79213, longitude: 34.64966 },
  },
  {
    slug: "bnei-brak",
    label: "Bnei Brak",
    center: { latitude: 32.08074, longitude: 34.8338 },
  },
  {
    slug: "holon",
    label: "Holon",
    center: { latitude: 32.01034, longitude: 34.77918 },
  },
  {
    slug: "beer-sheva",
    label: "Be'er Sheva",
    center: { latitude: 31.25181, longitude: 34.7913 },
  },
  {
    slug: "ramat-gan",
    label: "Ramat Gan",
    center: { latitude: 32.08227, longitude: 34.81065 },
  },
  {
    slug: "rehovot",
    label: "Rehovot",
    center: { latitude: 31.89421, longitude: 34.81199 },
  },
  {
    slug: "ashkelon",
    label: "Ashkelon",
    center: { latitude: 31.66926, longitude: 34.57149 },
  },
] as const satisfies readonly ReviewedPilotCityEntry[];

export type ReviewedPilotCity = (typeof REVIEWED_PILOT_CITIES)[number];

const citiesBySlug = new Map<ReviewedPilotCitySlug, ReviewedPilotCity>(
  REVIEWED_PILOT_CITIES.map((city) => [city.slug, city]),
);

const PRIVATE_PIN_RADIUS_METERS = 10_000;
const EARTH_RADIUS_METERS = 6_371_000;

export function findReviewedPilotCity(value: unknown): ReviewedPilotCity | null {
  const parsed = reviewedPilotCitySlugSchema.safeParse(value);
  if (!parsed.success) return null;
  return citiesBySlug.get(parsed.data) ?? null;
}

export function isPointWithinReviewedPilotCity(
  city: ReviewedPilotCity,
  point: PrivatePoint,
): boolean {
  if (
    !Number.isFinite(point.latitude) ||
    !Number.isFinite(point.longitude) ||
    point.latitude < -90 ||
    point.latitude > 90 ||
    point.longitude < -180 ||
    point.longitude > 180
  ) {
    return false;
  }

  const toRadians = Math.PI / 180;
  const latitudeDelta = (point.latitude - city.center.latitude) * toRadians;
  const longitudeDelta = (point.longitude - city.center.longitude) * toRadians;
  const startLatitude = city.center.latitude * toRadians;
  const endLatitude = point.latitude * toRadians;
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  const distance = 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(haversine)));

  return distance <= PRIVATE_PIN_RADIUS_METERS;
}
