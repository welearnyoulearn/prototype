// One-time generator for the onboarding preset avatars. Not run at build or
// runtime — outputs static SVGs to public/avatars/{portal}/{gender}/{1-5}.svg,
// which get committed and served as plain static files. Re-run manually only
// if the curated option sets below change.
//
// Uses DiceBear's "avataaars" style (open-source, MIT) via @dicebear/core +
// @dicebear/collection, both devDependencies — no runtime cost, no network
// calls, no client bundle impact.
import { createAvatar } from '@dicebear/core'
import { avataaars } from '@dicebear/collection'
import { mkdirSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_ROOT = join(__dirname, '..', 'public', 'avatars')

const skinTones = ['614335', '8d5524', 'ae8b61', 'd08b5b', 'edb98a', 'fd9841', 'ffdbb4']
const bgColors = ['b6e3f4', 'c0aede', 'd1d4f9', 'ffd5dc', 'ffdfbf', 'e0f2e9', 'f4e5cf', 'dcebea', 'f2dfd9']

function bg(i) { return [bgColors[i % bgColors.length]] }
function skin(i) { return [skinTones[i % skinTones.length]] }

// Each entry: { top, clothing, clothesColor, hairColor, eyes, mouth, accessories?, facialHair? }
const HAIR_COLORS = ['2c1b18', '4a312c', '724133', 'a55728', 'b58143', 'c93305', 'e8e1e1', '000000']
// Friendly-only subset — the full clothingGraphic enum includes skull/skullOutline/resist,
// not appropriate for a school app's student avatars.
const GRAPHICS = ['bear', 'deer', 'pizza', 'diamond', 'bat']

const STUDENT_MALE = [
  { top: 'shortFlat', clothing: 'graphicShirt' },
  { top: 'shortWaved', clothing: 'hoodie' },
  { top: 'shortRound', clothing: 'shirtCrewNeck' },
  { top: 'theCaesar', clothing: 'shirtVNeck' },
  { top: 'shaggy', clothing: 'overall' },
]
const STUDENT_FEMALE = [
  { top: 'bob', clothing: 'graphicShirt' },
  { top: 'bun', clothing: 'hoodie' },
  { top: 'curly', clothing: 'shirtCrewNeck' },
  { top: 'straight02', clothing: 'shirtVNeck' },
  { top: 'longButNotTooLong', clothing: 'overall' },
]
const STUDENT_NEUTRAL = [
  { top: 'shortFlat', clothing: 'graphicShirt' },
  { top: 'bob', clothing: 'hoodie' },
  { top: 'curly', clothing: 'shirtCrewNeck' },
  { top: 'shaggyMullet', clothing: 'shirtVNeck' },
  { top: 'froBand', clothing: 'overall' },
]

const TEACHER_MALE = [
  { top: 'shortFlat', clothing: 'blazerAndShirt' },
  { top: 'theCaesarAndSidePart', clothing: 'blazerAndSweater', accessories: 'prescription02' },
  { top: 'shortRound', clothing: 'collarAndSweater', facialHair: 'beardLight' },
  { top: 'sides', clothing: 'blazerAndShirt', accessories: 'wayfarers' },
  { top: 'shortWaved', clothing: 'shirtCrewNeck' },
]
const TEACHER_FEMALE = [
  { top: 'bun', clothing: 'blazerAndShirt' },
  { top: 'bob', clothing: 'blazerAndSweater', accessories: 'prescription01' },
  { top: 'straight01', clothing: 'collarAndSweater' },
  { top: 'miaWallace', clothing: 'blazerAndShirt' },
  { top: 'curvy', clothing: 'shirtCrewNeck', accessories: 'round' },
]
const TEACHER_NEUTRAL = [
  { top: 'shortFlat', clothing: 'blazerAndShirt' },
  { top: 'bob', clothing: 'blazerAndSweater' },
  { top: 'shortRound', clothing: 'collarAndSweater', accessories: 'prescription02' },
  { top: 'straight02', clothing: 'blazerAndShirt' },
  { top: 'sides', clothing: 'shirtCrewNeck' },
]

const PARENT_MALE = [
  { top: 'shortFlat', clothing: 'collarAndSweater' },
  { top: 'shortRound', clothing: 'blazerAndShirt' },
  { top: 'theCaesar', clothing: 'shirtVNeck', facialHair: 'beardMedium' },
  { top: 'sides', clothing: 'hoodie' },
  { top: 'shaggy', clothing: 'shirtScoopNeck', facialHair: 'moustacheFancy' },
]
const PARENT_FEMALE = [
  { top: 'bun', clothing: 'collarAndSweater' },
  { top: 'bob', clothing: 'blazerAndShirt' },
  { top: 'frida', clothing: 'shirtVNeck' },
  { top: 'curly', clothing: 'hoodie' },
  { top: 'longButNotTooLong', clothing: 'shirtScoopNeck' },
]
const PARENT_NEUTRAL = [
  { top: 'shortFlat', clothing: 'collarAndSweater' },
  { top: 'bob', clothing: 'blazerAndShirt' },
  { top: 'curly', clothing: 'shirtVNeck' },
  { top: 'shortWaved', clothing: 'hoodie' },
  { top: 'straight01', clothing: 'shirtScoopNeck' },
]

const SETS = {
  student: { male: STUDENT_MALE, female: STUDENT_FEMALE, neutral: STUDENT_NEUTRAL },
  teacher: { male: TEACHER_MALE, female: TEACHER_FEMALE, neutral: TEACHER_NEUTRAL },
  parent: { male: PARENT_MALE, female: PARENT_FEMALE, neutral: PARENT_NEUTRAL },
}

let total = 0
for (const [portal, genders] of Object.entries(SETS)) {
  for (const [gender, list] of Object.entries(genders)) {
    const dir = join(OUT_ROOT, portal, gender)
    mkdirSync(dir, { recursive: true })
    list.forEach((opts, i) => {
      const n = i + 1
      const seed = `${portal}-${gender}-${n}`
      const avatar = createAvatar(avataaars, {
        seed,
        top: [opts.top],
        clothing: [opts.clothing],
        clothesColor: bg(i + 2),
        skinColor: skin(i),
        hairColor: [HAIR_COLORS[(i + portal.length) % HAIR_COLORS.length]],
        backgroundColor: bg(i),
        eyes: ['default'],
        eyebrows: ['default'],
        mouth: ['smile'],
        accessories: opts.accessories ? [opts.accessories] : [],
        accessoriesProbability: opts.accessories ? 100 : 0,
        facialHair: opts.facialHair ? [opts.facialHair] : [],
        facialHairProbability: opts.facialHair ? 100 : 0,
        clothingGraphic: opts.clothing === 'graphicShirt' ? [GRAPHICS[i % GRAPHICS.length]] : [],
      })
      writeFileSync(join(dir, `${n}.svg`), avatar.toString())
      total++
    })
  }
}

console.log(`Generated ${total} avatar SVGs under public/avatars/`)
