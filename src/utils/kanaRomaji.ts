import * as wanakana from 'wanakana'

export function getRomajiLength(kana: string): number {
  return wanakana.toRomaji(kana).length
}

export function getKanaRomaji(kana: string): string {
  return wanakana.toRomaji(kana)
}

// 判断是否是假名（平假名或片假名）
export function isKana(text: string): boolean {
  return wanakana.isKana(text)
}

// 判断是否是平假名
export function isHiragana(text: string): boolean {
  return wanakana.isHiragana(text)
}

// 判断是否是片假名
export function isKatakana(text: string): boolean {
  return wanakana.isKatakana(text)
}
