import { z } from "zod";

export const deleteAccountSchema = z.object({
  currentPassword: z
    .string()
    .min(1, "Enter your current password.")
    .max(72, "Use 72 characters or fewer."),
  confirmation: z
    .string()
    .max(16, "Type DELETE to confirm.")
    .refine((value) => value === "DELETE", {
      message: "Type DELETE exactly to confirm.",
    }),
});
