"use client"

import { type SelectedCity } from "@/components/CityPicker"
import { DocsButton } from "@/components/DocsButton"
import { PrivacyDisclaimer } from "@/components/PrivacyDisclaimer"
import { TelegramCard } from "./TelegramCard"
import { IdentitySection } from "./IdentitySection"
import { ChangePasswordCard } from "./ChangePasswordCard"
import { DangerZone } from "./DangerZone"
import { type LifecycleEvent } from "../lifecycle"

export function ProfileForm({
  email,
  displayName,
  telegramLinked: _telegramLinked,
  avatarUrl,
  initialCity,
  initialGender,
  initialBirthday,
  lifecycleEvents,
}: {
  email: string
  displayName: string
  telegramLinked: boolean
  avatarUrl: string | null
  initialCity: SelectedCity | null
  initialGender: "M" | "F" | null
  initialBirthday: string | null
  lifecycleEvents: LifecycleEvent[]
}) {
  void _telegramLinked

  return (
    <div className="space-y-4">
      <IdentitySection
        email={email}
        displayName={displayName}
        avatarUrl={avatarUrl}
        initialCity={initialCity}
        initialGender={initialGender}
        initialBirthday={initialBirthday}
      />

      <ChangePasswordCard />

      <TelegramCard />

      <div className="flex flex-wrap items-center justify-center gap-3">
        <DocsButton source="profile" shape="pill" />
        <PrivacyDisclaimer />
      </div>

      <DangerZone events={lifecycleEvents} />
    </div>
  )
}
