"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { BrazilMap, type UserPin } from "../BrazilMap"

export function GeoSection({
  userPins,
  ufCounts,
}: {
  userPins: UserPin[]
  ufCounts: Array<{ uf: string; count: number }>
}) {
  return (
    <section>
      <Card>
        <CardHeader>
          <CardTitle>Distribuição geográfica</CardTitle>
          <CardDescription>
            Pins por usuário. Azul · Masculino, rosa · Feminino, cinza ·
            não informado. Passe o mouse em cima para ver nome, cidade e
            dias de plataforma.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BrazilMap userPins={userPins} ufCounts={ufCounts} />
        </CardContent>
      </Card>
    </section>
  )
}
