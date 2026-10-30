import { stripDiacritics } from './normalize'
import type { DataType } from './types'

/**
 * Realistic but fake Vietnamese values. Each generator maps an index in [0, size) to a
 * distinct value; a random affine permutation of the indexes makes the order unpredictable
 * while guaranteeing no two values repeat.
 */

const HO = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý', 'Đào', 'Đinh', 'Lâm', 'Mai']
const DEM_NAM = ['Văn', 'Minh', 'Đức', 'Hữu', 'Quốc', 'Thanh', 'Gia', 'Bảo', 'Công', 'Hoàng']
const DEM_NU = ['Thị', 'Ngọc', 'Thu', 'Thanh', 'Minh', 'Phương', 'Hồng', 'Kim', 'Bảo', 'Khánh']
const TEN_NAM = ['An', 'Bình', 'Cường', 'Dũng', 'Duy', 'Đạt', 'Hải', 'Hiếu', 'Hoàng', 'Huy', 'Hùng', 'Khang', 'Khoa', 'Kiên', 'Long', 'Lộc', 'Minh', 'Nam', 'Nghĩa', 'Phong', 'Phúc', 'Quân', 'Sơn', 'Tài', 'Thắng', 'Thịnh', 'Toàn', 'Trung', 'Tuấn', 'Vinh']
const TEN_NU = ['Anh', 'Châu', 'Chi', 'Diệp', 'Dung', 'Giang', 'Hà', 'Hạnh', 'Hoa', 'Hương', 'Lan', 'Linh', 'Ly', 'Mai', 'My', 'Nga', 'Ngân', 'Nhung', 'Oanh', 'Phương', 'Quỳnh', 'Tâm', 'Thảo', 'Thư', 'Trang', 'Trâm', 'Uyên', 'Vân', 'Vy', 'Yến']

const ORG_KIND = ['Công ty TNHH', 'Công ty Cổ phần', 'Công ty', 'Tập đoàn']
const ORG_WORD = ['An', 'Bình', 'Phát', 'Thịnh', 'Hưng', 'Minh', 'Tân', 'Việt', 'Đại', 'Phú', 'Quý', 'Long', 'Hoàng', 'Sao', 'Mai', 'Khang', 'Thành', 'Công', 'Tiến', 'Nam', 'Á', 'Hòa', 'Lộc', 'Gia', 'Kim', 'Ngọc', 'Bảo', 'Đông', 'Tây', 'Trường']

const STREET = ['Lê Lợi', 'Trần Hưng Đạo', 'Nguyễn Trãi', 'Hai Bà Trưng', 'Lý Thường Kiệt', 'Phan Chu Trinh', 'Quang Trung', 'Hùng Vương', 'Điện Biên Phủ', 'Võ Văn Tần', 'Nguyễn Du', 'Bà Triệu', 'Pasteur', 'Hoàng Diệu', 'Lê Duẩn', 'Cách Mạng Tháng 8', 'Nguyễn Huệ', 'Phạm Ngũ Lão', 'Trường Chinh', 'Lạc Long Quân']
const WARD = ['Phường An Phú', 'Phường Bình An', 'Phường Tân Thành', 'Phường Hòa Bình', 'Phường Phú Lợi', 'Phường Thạnh Mỹ', 'Phường Đông Hòa', 'Phường Tây Sơn', 'Phường Minh Khai', 'Phường Quang Trung']
const CITY = ['Hà Nội', 'TP. Hồ Chí Minh', 'Đà Nẵng', 'Hải Phòng', 'Cần Thơ', 'Huế']

const NAMES_PER_GENDER = HO.length * DEM_NAM.length * TEN_NAM.length

function fakeName(i: number): string {
  const female = i % 2 === 1
  let r = Math.floor(i / 2)
  const ho = HO[r % HO.length]
  r = Math.floor(r / HO.length)
  const dem = (female ? DEM_NU : DEM_NAM)[r % DEM_NAM.length]
  r = Math.floor(r / DEM_NAM.length)
  const ten = (female ? TEN_NU : TEN_NAM)[r % TEN_NAM.length]
  return `${ho} ${dem} ${ten}`
}

function slug(s: string): string {
  return stripDiacritics(s).toLowerCase().replace(/[^a-z]/g, '')
}

const GENERATORS = {
  name: { size: 2 * NAMES_PER_GENDER, make: fakeName },
  phone: { size: 1e8, make: (i: number) => '09' + String(i).padStart(8, '0') },
  // Province code 079 + 9 digits = a 12-digit CCCD.
  id: { size: 1e9, make: (i: number) => '079' + String(i).padStart(9, '0') },
  email: {
    size: 2 * NAMES_PER_GENDER * 100,
    make: (i: number) => {
      const parts = fakeName(i % (2 * NAMES_PER_GENDER)).split(' ')
      const n = Math.floor(i / (2 * NAMES_PER_GENDER))
      return `${slug(parts[2])}.${slug(parts[0])}${n || ''}@example.com`
    },
  },
  org: {
    size: ORG_KIND.length * ORG_WORD.length * ORG_WORD.length,
    make: (i: number) => {
      const kind = ORG_KIND[i % ORG_KIND.length]
      const r = Math.floor(i / ORG_KIND.length)
      return `${kind} ${ORG_WORD[r % ORG_WORD.length]} ${ORG_WORD[Math.floor(r / ORG_WORD.length) % ORG_WORD.length]}`
    },
  },
  address: {
    size: 200 * STREET.length * WARD.length * CITY.length,
    make: (i: number) => {
      let r = i
      const no = (r % 200) + 1
      r = Math.floor(r / 200)
      const street = STREET[r % STREET.length]
      r = Math.floor(r / STREET.length)
      const ward = WARD[r % WARD.length]
      const city = CITY[Math.floor(r / WARD.length) % CITY.length]
      return `Số ${no} ${street}, ${ward}, ${city}`
    },
  },
} satisfies Record<string, { size: number; make: (i: number) => string }>

export type FakeType = keyof typeof GENERATORS

export function canFake(type: DataType): type is FakeType {
  return type in GENERATORS
}

function gcd(a: bigint, b: bigint): bigint {
  while (b) [a, b] = [b, a % b]
  return a
}

/**
 * Returns a function producing a new fake value on each call: never the same value twice,
 * and never a value for which `isTaken` is true (e.g. one that exists in the real data).
 */
export function makeFaker(type: FakeType, random: () => number, isTaken: (value: string) => boolean): () => string {
  const { size, make } = GENERATORS[type]
  const M = BigInt(size)
  let a = 1n
  for (let tries = 0; tries < 50; tries++) {
    const candidate = BigInt(1 + Math.floor(random() * (size - 1)))
    if (gcd(candidate, M) === 1n) {
      a = candidate
      break
    }
  }
  const b = BigInt(Math.floor(random() * size))
  let k = 0
  return () => {
    for (;;) {
      const round = Math.floor(k / size)
      const idx = Number((a * BigInt(k % size) + b) % M)
      k++
      // Out of distinct values: add a counter rather than repeat one.
      const value = round === 0 ? make(idx) : `${make(idx)} ${round + 1}`
      if (!isTaken(value)) return value
    }
  }
}
