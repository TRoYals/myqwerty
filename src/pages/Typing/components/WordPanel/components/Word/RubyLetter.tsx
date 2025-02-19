import type { LetterState } from './Letter'
import { fontSizeConfigAtom } from '@/store'
import { getKanaRomaji } from '@/utils/kanaRomaji'
import { useAtomValue } from 'jotai'
import React from 'react'

export type RubyLetterProps = {
  kanji: string
  furigana: string
  romajiLength: number
  currentRomajiIndex: number
  letterStates: LetterState[]
  visible?: boolean
  romajiParts?: string[] // 新增字段
}

const stateClassNameMap: Record<LetterState, string> = {
  normal: 'text-gray-600 dark:text-gray-50',
  correct: 'text-green-600 dark:text-green-400',
  wrong: 'text-red-600 dark:text-red-400',
}

// 判断是否是促音
const isSokuon = (char: string) => {
  return char === 'っ' || char === 'ッ'
}

// 获取下一个假名的第一个罗马字辅音
const getNextConsonant = (nextChar: string) => {
  if (!nextChar) return ''
  const romaji = getKanaRomaji(nextChar)
  return romaji.match(/^[bcdfghjklmnpqrstvwxyz]/)?.[0] || ''
}

const RubyLetter: React.FC<RubyLetterProps> = ({
  kanji,
  furigana,
  romajiLength,
  currentRomajiIndex,
  letterStates,
  visible = true,
  romajiParts = [],
}) => {
  const fontSizeConfig = useAtomValue(fontSizeConfigAtom)

  // 添加关键参数的日志
  console.log('RubyLetter 渲染:', {
    kanji,
    furigana,
    romajiLength,
    currentRomajiIndex,
    letterStates,
    visible,
    romajiParts,
  })

  // 计算每个平假名字符对应的罗马字范围和状态
  const furiganaChars = furigana.split('').reduce<
    {
      char: string
      isTyped: boolean
      hasError: boolean
      charEndIndex: number
      charStartIndex: number
      isComplete: boolean
      states: LetterState[]
    }[]
  >((acc, char, idx) => {
    // 检查当前字符是否是拗音的一部分
    if (idx > 0 && char.match(/[ゃゅょぁぃぅぇぉャュョァィゥェォ]/)) {
      // 如果是拗音的第二个字符，跳过（因为已经在前一个字符中处理过了）
      return acc
    }

    const nextChar = furigana[idx + 1]
    const isYouon = nextChar?.match(/[ゃゅょぁぃぅぇぉャュョァィゥェォ]/)
    const currentChar = isYouon ? char + nextChar : char

    // 使用 romajiParts 来获取准确的罗马字长度
    let charStartIndex = 0
    if (acc.length > 0) {
      const lastChar = acc[acc.length - 1]
      charStartIndex = lastChar.charEndIndex
    }

    // 处理促音的情况
    let currentRomajiLength = 0
    let kanaRomaji = ''

    if (isSokuon(char)) {
      // 如果是促音，需要获取下一个假名的第一个辅音
      const nextKana = furigana[idx + 1]
      const consonant = getNextConsonant(nextKana)
      currentRomajiLength = consonant ? 1 : 0 // 促音的长度是1（重复的辅音）
      kanaRomaji = consonant // 促音对应的罗马字就是下一个假名的第一个辅音
    } else {
      kanaRomaji = getKanaRomaji(currentChar)
      currentRomajiLength = kanaRomaji.length
    }

    const charEndIndex = charStartIndex + currentRomajiLength

    // 添加每个假名字符的罗马字映射日志
    // console.log(`假名字符 "${currentChar}" 对应的罗马字范围:`, {
    //   charStartIndex,
    //   charEndIndex,
    //   对应的罗马字状态: letterStates.slice(charStartIndex, charEndIndex),
    //   是否为拗音: isYouon,
    //   是否为促音: isSokuon(char),
    //   罗马字长度: currentRomajiLength,
    //   对应的罗马字: kanaRomaji,
    //   对应的罗马字部分: romajiParts[acc.length]
    // })

    // 检查这个字符对应的罗马字区间内的状态
    const charStates = letterStates.slice(charStartIndex, charEndIndex)
    const isTyped = currentRomajiIndex > charStartIndex
    const hasError = charStates.some((state) => state === 'wrong')

    // 修改完成状态的判断逻辑
    const isComplete =
      isTyped &&
      currentRomajiIndex >= charEndIndex && // 已经输入到或超过结束位置
      charStates.length === currentRomajiLength && // 状态数组长度等于应有的罗马字长度
      charStates.every((state) => state === 'correct') // 所有状态都是正确的

    // 添加调试日志
    // if (isYouon || currentRomajiLength > 1 || isSokuon(char)) {
    //   console.log(`特殊音节状态检查 "${currentChar}":`, {
    //     已输入数量: currentRomajiIndex - charStartIndex,
    //     需要输入数量: currentRomajiLength,
    //     当前状态: charStates,
    //     是否完成: isComplete,
    //     输入位置: currentRomajiIndex,
    //     开始位置: charStartIndex,
    //     结束位置: charEndIndex,
    //     是否为促音: isSokuon(char)
    //   })
    // }

    acc.push({
      char: currentChar,
      isTyped,
      hasError,
      charEndIndex,
      charStartIndex,
      isComplete,
      states: charStates,
    })

    return acc
  }, [])

  // 判断是否是片假名（没有对应的汉字）
  const isKana = kanji === furigana

  // 计算整体状态
  const hasAnyError = furiganaChars.some((f) => f.hasError)
  const allStates = letterStates.slice(0, currentRomajiIndex)

  // 修改：确保所有字符都完全输入完
  const isCurrentCorrect =
    allStates.length > 0 &&
    allStates.every((state) => state === 'correct') &&
    furiganaChars.every((char) => {
      // 检查每个字符是否都完全输入完成
      const charStates = letterStates.slice(char.charStartIndex, char.charEndIndex)
      return charStates.length === char.charEndIndex - char.charStartIndex && charStates.every((state) => state === 'correct')
    })

  const isAllComplete = currentRomajiIndex >= romajiLength && isCurrentCorrect

  // 汉字状态：只有在全部输入完成时才变绿
  const kanjiState = hasAnyError
    ? 'wrong'
    : isKana
    ? 'normal' // 片假名不需要整体变色
    : isAllComplete
    ? 'correct'
    : 'normal'

  return (
    <ruby className={`mb-1 p-0 font-mono transition-colors duration-200`}>
      <span className={`${isKana ? '' : stateClassNameMap[kanjiState]}`} style={{ fontSize: fontSizeConfig.foreignFont.toString() + 'px' }}>
        {visible ? kanji : '_'}
      </span>
      <rp>(</rp>
      <rt className="text-[0.5em]">
        {visible ? (
          <span>
            {furiganaChars.map((info, idx) => {
              const isCurrentChar = currentRomajiIndex > info.charStartIndex && currentRomajiIndex <= info.charEndIndex
              const currentCharStates = info.states.slice(0, currentRomajiIndex - info.charStartIndex)
              const isCurrentCharCorrect =
                currentCharStates.length === info.charEndIndex - info.charStartIndex && // 修改：确保输入完整个字符
                currentCharStates.every((state) => state === 'correct')

              return (
                <span
                  key={idx}
                  className={`${
                    info.isComplete
                      ? stateClassNameMap.correct
                      : info.hasError
                      ? stateClassNameMap.wrong
                      : isCurrentChar && isCurrentCharCorrect
                      ? stateClassNameMap.correct
                      : 'text-gray-400'
                  }`}
                >
                  {info.char}
                </span>
              )
            })}
          </span>
        ) : (
          '_'.repeat(furigana.length)
        )}
      </rt>
      <rp>)</rp>
    </ruby>
  )
}

export default React.memo(RubyLetter)
