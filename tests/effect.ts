import { Effect, Schema } from 'effect'
import { flow } from 'effect/Function'

export const calculateAvailability = flow(
  Schema.decodeUnknownEffect(
    Schema.Struct({
      label: Schema.Trim.check(Schema.isMinLength(1), Schema.isMaxLength(80)),
      quantity: Schema.Int.check(Schema.isBetween({ maximum: 100, minimum: 1 })),
      reserved: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    }).check(Schema.makeFilter(({ quantity, reserved }) => reserved <= quantity)),
  ),
  Effect.map((input) => ({
    ...input,
    available: input.quantity - input.reserved,
  })),
)
