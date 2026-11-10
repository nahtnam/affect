import { Schema } from 'effect'

export const statusPath = '/api/affect-dev/status'
export const emailInboxPath = '/api/affect-dev/emails'
export const signInCodePath = '/api/affect-dev/sign-in-code'

export const EmailMessage = Schema.Struct({
  code: Schema.String.check(Schema.isMinLength(1)),
  createdAt: Schema.Finite,
  expiresAt: Schema.Finite,
  from: Schema.optionalKey(Schema.String),
  html: Schema.optionalKey(Schema.String),
  subject: Schema.String,
  text: Schema.String,
  to: Schema.String,
})

const EmailPreviewSchema = Schema.Struct({
  ...EmailMessage.fields,
  id: Schema.String,
})

export type EmailPreview = typeof EmailPreviewSchema.Type

export const EmailInboxSchema = Schema.Struct({
  emails: Schema.Array(EmailPreviewSchema),
})

export const EmailRequest = Schema.Struct({
  email: Schema.Trim.check(Schema.isMinLength(1), Schema.isMaxLength(254)),
})

export const SignInCodeResult = Schema.Struct({
  error: Schema.NullOr(Schema.Struct({ message: Schema.String })),
  preview: Schema.Boolean,
})

export const Availability = Schema.Struct({ available: Schema.Literal(true) })
