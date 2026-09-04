import { z } from "zod";

const emailSchema = z
  .string()
  .trim()
  .min(1, "Enter your email address.")
  .max(254, "Email addresses must be 254 characters or fewer.")
  .pipe(z.email("Enter a valid email address."))
  .transform((email) => email.toLowerCase());

const existingPasswordSchema = z
  .string()
  .min(1, "Enter your password.")
  .max(72, "Use 72 characters or fewer.");

const newPasswordSchema = z
  .string()
  .min(15, "Use at least 15 characters.")
  .max(72, "Use 72 characters or fewer.");

const passwordConfirmationSchema = z.string().max(72, "Use 72 characters or fewer.");

export const signUpSchema = z
  .object({
    email: emailSchema,
    password: newPasswordSchema,
    confirmPassword: passwordConfirmationSchema,
  })
  .refine(({ password, confirmPassword }) => password === confirmPassword, {
    message: "Passwords must match.",
    path: ["confirmPassword"],
  });

export const signInSchema = z.object({
  email: emailSchema,
  password: existingPasswordSchema,
});

export const passwordResetRequestSchema = z.object({
  email: emailSchema,
});

export const passwordUpdateSchema = z
  .object({
    password: newPasswordSchema,
    confirmPassword: passwordConfirmationSchema,
  })
  .refine(({ password, confirmPassword }) => password === confirmPassword, {
    message: "Passwords must match.",
    path: ["confirmPassword"],
  });

export const knownPasswordUpdateSchema = z
  .object({
    currentPassword: existingPasswordSchema,
    password: newPasswordSchema,
    confirmPassword: passwordConfirmationSchema,
  })
  .refine(({ password, confirmPassword }) => password === confirmPassword, {
    message: "Passwords must match.",
    path: ["confirmPassword"],
  });

export const emailChangeRequestSchema = z.object({
  email: emailSchema,
  currentPassword: existingPasswordSchema,
});

export const emailChangeQuerySchema = z.object({
  tokenHash: z.string().min(1).max(2048),
  type: z.literal("email_change"),
});

export const verificationQuerySchema = z.object({
  tokenHash: z.string().min(1).max(2048),
  type: z.literal("email"),
});

export const verificationCodeQuerySchema = z.object({
  code: z.string().min(1).max(2048),
});

export const recoveryQuerySchema = z.object({
  tokenHash: z.string().min(1).max(2048),
  type: z.literal("recovery"),
});

export const verificationStatusSchema = z.literal("expired");

export type SignUpInput = z.infer<typeof signUpSchema>;
export type SignInInput = z.infer<typeof signInSchema>;
export type KnownPasswordUpdateInput = z.infer<typeof knownPasswordUpdateSchema>;
