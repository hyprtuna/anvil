import { z } from 'zod'

export const OpenCodeConfig = z
  .object({
    plugin: z.array(z.string()).optional(),
    skills: z
      .object({
        paths: z.array(z.string()).optional(),
      })
      .strict()
      .optional(),
  })
  .passthrough()

export type OpenCodeConfigT = z.infer<typeof OpenCodeConfig>
