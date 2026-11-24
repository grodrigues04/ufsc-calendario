// Bottom sheets (vaul + radix). Loaded lazily, after the first paint, to keep startup light.
import { AbsenceDrawer } from './absence-drawer'
import { DisciplineDrawer } from './discipline-drawer'
import { ProfileDrawer } from './profile-drawer'

export default function Sheets() {
  return (
    <>
      <DisciplineDrawer />
      <ProfileDrawer />
      <AbsenceDrawer />
    </>
  )
}
