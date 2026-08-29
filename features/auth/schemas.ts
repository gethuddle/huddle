import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .min(1, "Enter your email address.")
  .max(254, "Email addresses must be 254 characters or fewer.")
  .pipe(z.email("Enter a valid email address."))
  .transform((email) => email.toLowerCase());

const passwordSchema = z
  .string()
  .min(8, "Use at least 8 characters.")
  .max(72, "Use 72 characters or fewer.");

export const signUpSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine(({ password, confirmPassword }) => password === confirmPassword, {
    message: "Passwords must match.",
    path: ["confirmPassword"],
  });

export const signInSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const verificationQuerySchema = z.object({
  tokenHash: z.string().min(1).max(2048),
  type: z.literal("email"),
});

export const verificationCodeQuerySchema = z.object({
  code: z.string().min(1).max(2048),
});

export const verificationStatusSchema = z.enum(["success", "expired"]);

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
