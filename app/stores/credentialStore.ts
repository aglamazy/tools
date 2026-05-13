import { db } from '@/app/db/financeDB'
import type { CredentialRow, CredentialService } from '@/app/types/credential'

export const credentialStore = {
  async list(): Promise<CredentialRow[]> {
    return db.credentials.toArray()
  },

  async getByService(service: CredentialService): Promise<CredentialRow | undefined> {
    return db.credentials.where('service').equals(service).first()
  },

  async upsert(input: {
    service: CredentialService
    serviceName?: string
    userCode: string
    password: string
    notes?: string
  }): Promise<number> {
    const existing = await this.getByService(input.service)
    const updatedAt = new Date().toISOString()

    if (existing) {
      await db.credentials.update(existing.id!, {
        serviceName: input.serviceName,
        userCode: input.userCode,
        password: input.password,
        notes: input.notes,
        updatedAt,
      })
      return existing.id!
    }
    return (await db.credentials.add({
      service: input.service,
      serviceName: input.serviceName,
      userCode: input.userCode,
      password: input.password,
      notes: input.notes,
      updatedAt,
    })) as number
  },

  async delete(id: number): Promise<void> {
    await db.credentials.delete(id)
  },
}
