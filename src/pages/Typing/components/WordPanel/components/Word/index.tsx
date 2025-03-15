import type { WordUpdateAction } from '../InputHandler'
import InputHandler from '../InputHandler'
import Letter from './Letter'
import Notation from './Notation'
import RubyLetter from './RubyLetter'
import { TipAlert } from './TipAlert'
import style from './index.module.css'
import { initialWordState } from './type'
import type { WordState } from './type'
import Tooltip from '@/components/Tooltip'
import type { WordPronunciationIconRef } from '@/components/WordPronunciationIcon'
import { WordPronunciationIcon } from '@/components/WordPronunciationIcon'
import { EXPLICIT_SPACE } from '@/constants'
import useKeySounds from '@/hooks/useKeySounds'
import { TypingContext, TypingStateActionType } from '@/pages/Typing/store'
import {
  currentChapterAtom,
  currentDictInfoAtom,
  isIgnoreCaseAtom,
  isShowAnswerOnHoverAtom,
  isTextSelectableAtom,
  pronunciationIsOpenAtom,
  wordDictationConfigAtom,
} from '@/store'
import type { Word } from '@/typings'
import { CTRL, getUtcStringForMixpanel, useMixPanelWordLogUploader } from '@/utils'
import { useSaveWordRecord } from '@/utils/db'
import { getKanaRomaji, getRomajiLength, isKana } from '@/utils/kanaRomaji'
import { useAtomValue } from 'jotai'
import { useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useHotkeys } from 'react-hotkeys-hook'
import { useImmer } from 'use-immer'

const vowelLetters = ['A', 'E', 'I', 'O', 'U']

type ParsedNotation = {
  kanji: string
  furigana: string
  romajiStart: number
  romajiLength: number
  romajiParts: string[]
}[]

// 判断是否是拗音的辅助函数
const isYouon = (current: string, next?: string) => {
  if (!next) return false
  // 检查下一个字符是否是小写的 や、ゆ、よ、ぁ、ぃ、ぅ、ぇ、ぉ
  return next.match(/[ゃゅょぁぃぅぇぉャュョァィゥェォ]/)
}

const parseNotation = (notation: string, romaji: string): ParsedNotation => {
  const result: ParsedNotation = []
  let currentPosition = 0

  // 将注音部分分割成数组
  const parts =
    notation.includes('(') || notation.includes('（')
      ? notation.split(/([()（）])/).filter((part) => part !== '(' && part !== ')' && part !== '（' && part !== '）')
      : [notation]

  // 处理每个部分
  for (let i = 0; i < parts.length; i += 2) {
    const text = parts[i]
    const furigana = parts[i + 1] || ''

    if (!text) continue

    if (isKana(text)) {
      // 如果是假名，需要处理拗音的情况
      const chars = text.split('')
      for (let j = 0; j < chars.length; j++) {
        const char = chars[j]
        const nextChar = chars[j + 1]

        if (isYouon(char, nextChar)) {
          // 如果是拗音组合，一起处理
          const combination = char + nextChar
          const kanaRomaji = getKanaRomaji(combination)
          // 从当前位置开始，在完整的罗马字中查找这个片段
          const romajiPart = romaji.slice(currentPosition)
          const romajiLength = kanaRomaji.length
          result.push({
            kanji: combination,
            furigana: '', // 假名不需要注音
            romajiStart: currentPosition,
            romajiLength,
            romajiParts: [kanaRomaji],
          })
          currentPosition += romajiLength
          j++ // 跳过下一个字符，因为已经处理过了
        } else if (!isYouon(chars[j - 1], char)) {
          // 如果不是拗音的一部分，单独处理
          const kanaRomaji = getKanaRomaji(char)
          const romajiLength = kanaRomaji.length
          result.push({
            kanji: char,
            furigana: '', // 假名不需要注音
            romajiStart: currentPosition,
            romajiLength,
            romajiParts: [kanaRomaji],
          })
          currentPosition += romajiLength
        }
      }
    } else if (furigana) {
      // 修改这部分代码来处理注音中的拗音
      const chars = furigana.split('')
      let j = 0
      let totalRomajiLength = 0
      let processedFurigana = ''
      const romajiParts: string[] = []

      // 首先计算完整的罗马字长度并处理拗音组合
      while (j < chars.length) {
        const char = chars[j]
        const nextChar = chars[j + 1]

        if (isYouon(char, nextChar)) {
          const combination = char + nextChar
          const kanaRomaji = getKanaRomaji(combination)
          totalRomajiLength += kanaRomaji.length
          processedFurigana += combination
          romajiParts.push(kanaRomaji)
          j += 2
        } else {
          const kanaRomaji = getKanaRomaji(char)
          totalRomajiLength += kanaRomaji.length
          processedFurigana += char
          romajiParts.push(kanaRomaji)
          j++
        }
      }

      // 将整个注音作为一个整体添加到结果中，但保留每个音节的罗马字长度信息
      result.push({
        kanji: text,
        furigana: processedFurigana,
        romajiStart: currentPosition,
        romajiLength: totalRomajiLength,
        romajiParts,
      })
      currentPosition += totalRomajiLength
    } else {
      // 处理其他字符（如标点符号等）
      text.split('').forEach((char) => {
        if (isKana(char)) {
          const kanaRomaji = getKanaRomaji(char)
          const romajiLength = kanaRomaji.length
          result.push({
            kanji: char,
            furigana: char,
            romajiStart: currentPosition,
            romajiLength,
            romajiParts: [kanaRomaji],
          })
          currentPosition += romajiLength
        } else {
          result.push({
            kanji: char,
            furigana: char,
            romajiStart: currentPosition,
            romajiLength: 1,
            romajiParts: [],
          })
          currentPosition += 1
        }
      })
    }
  }

  return result
}

export default function WordComponent({ word, onFinish }: { word: Word; onFinish: () => void }) {
  // eslint-disable-next-line  @typescript-eslint/no-non-null-assertion
  const { state, dispatch } = useContext(TypingContext)!
  const [wordState, setWordState] = useImmer<WordState>(structuredClone(initialWordState))

  const wordDictationConfig = useAtomValue(wordDictationConfigAtom)
  const isTextSelectable = useAtomValue(isTextSelectableAtom)
  const isIgnoreCase = useAtomValue(isIgnoreCaseAtom)
  const isShowAnswerOnHover = useAtomValue(isShowAnswerOnHoverAtom)
  const saveWordRecord = useSaveWordRecord()
  const wordLogUploader = useMixPanelWordLogUploader(state)
  const [playKeySound, playBeepSound, playHintSound] = useKeySounds()
  const pronunciationIsOpen = useAtomValue(pronunciationIsOpenAtom)
  const [isHoveringWord, setIsHoveringWord] = useState(false)
  const currentLanguage = useAtomValue(currentDictInfoAtom).language
  const currentLanguageCategory = useAtomValue(currentDictInfoAtom).languageCategory
  const currentChapter = useAtomValue(currentChapterAtom)

  const [showTipAlert, setShowTipAlert] = useState(false)
  const wordPronunciationIconRef = useRef<WordPronunciationIconRef>(null)

  useEffect(() => {
    // run only when word changes
    let headword = ''
    try {
      headword = word.name.replace(new RegExp(' ', 'g'), EXPLICIT_SPACE)
      headword = headword.replace(new RegExp('…', 'g'), '..')
    } catch (e) {
      console.error('word.name is not a string', word)
      headword = ''
    }

    const newWordState = structuredClone(initialWordState)
    newWordState.displayWord = headword
    newWordState.letterStates = new Array(headword.length).fill('normal')
    newWordState.startTime = getUtcStringForMixpanel()
    newWordState.randomLetterVisible = headword.split('').map(() => Math.random() > 0.4)
    setWordState(newWordState)
  }, [word, setWordState])

  const updateInput = useCallback(
    (updateAction: WordUpdateAction) => {
      switch (updateAction.type) {
        case 'add':
          if (wordState.hasWrong) return

          if (updateAction.value === ' ') {
            updateAction.event.preventDefault()
            setWordState((state) => {
              state.inputWord = state.inputWord + EXPLICIT_SPACE
            })
          } else {
            setWordState((state) => {
              state.inputWord = state.inputWord + updateAction.value
            })
          }
          break

        default:
          console.warn('unknown update type', updateAction)
      }
    },
    [wordState.hasWrong, setWordState],
  )

  const handleHoverWord = useCallback((checked: boolean) => {
    setIsHoveringWord(checked)
  }, [])

  useHotkeys(
    'tab',
    () => {
      handleHoverWord(true)
    },
    { enableOnFormTags: true, preventDefault: true },
    [],
  )

  useHotkeys(
    'tab',
    () => {
      handleHoverWord(false)
    },
    { enableOnFormTags: true, keyup: true, preventDefault: true },
    [],
  )
  useHotkeys(
    'ctrl+j',
    () => {
      if (state.isTyping) {
        wordPronunciationIconRef.current?.play()
      }
    },
    [state.isTyping],
    { enableOnFormTags: true, preventDefault: true },
  )

  useEffect(() => {
    if (wordState.inputWord.length === 0 && state.isTyping) {
      wordPronunciationIconRef.current?.play && wordPronunciationIconRef.current?.play()
    }
  }, [state.isTyping, wordState.inputWord.length, wordPronunciationIconRef.current?.play])

  const getLetterVisible = useCallback(
    (index: number) => {
      if (wordState.letterStates[index] === 'correct' || (isShowAnswerOnHover && isHoveringWord)) return true

      if (wordDictationConfig.isOpen) {
        if (wordDictationConfig.type === 'hideAll') return false

        const letter = wordState.displayWord[index]
        if (wordDictationConfig.type === 'hideVowel') {
          return vowelLetters.includes(letter.toUpperCase()) ? false : true
        }
        if (wordDictationConfig.type === 'hideConsonant') {
          return vowelLetters.includes(letter.toUpperCase()) ? true : false
        }
        if (wordDictationConfig.type === 'randomHide') {
          return wordState.randomLetterVisible[index]
        }
      }
      return true
    },
    [
      isHoveringWord,
      isShowAnswerOnHover,
      wordDictationConfig.isOpen,
      wordDictationConfig.type,
      wordState.displayWord,
      wordState.letterStates,
      wordState.randomLetterVisible,
    ],
  )

  useEffect(() => {
    const inputLength = wordState.inputWord.length
    /**
     * TODO: 当用户输入错误时，会报错
     * Cannot update a component (`App`) while rendering a different component (`WordComponent`). To locate the bad setState() call inside `WordComponent`, follow the stack trace as described in https://reactjs.org/link/setstate-in-render
     * 目前不影响生产环境，猜测是因为开发环境下 react 会两次调用 useEffect 从而展示了这个 warning
     * 但这终究是一个 bug，需要修复
     */
    if (wordState.hasWrong || inputLength === 0 || wordState.displayWord.length === 0) {
      return
    }

    const inputChar = wordState.inputWord[inputLength - 1]
    const correctChar = wordState.displayWord[inputLength - 1]
    let isEqual = false
    if (inputChar != undefined && correctChar != undefined) {
      isEqual = isIgnoreCase ? inputChar.toLowerCase() === correctChar.toLowerCase() : inputChar === correctChar
    }

    if (isEqual) {
      // 输入正确时
      setWordState((state) => {
        state.letterTimeArray.push(Date.now())
        state.correctCount += 1
      })

      if (inputLength >= wordState.displayWord.length) {
        // 完成输入时
        setWordState((state) => {
          state.letterStates[inputLength - 1] = 'correct'
          state.isFinished = true
          state.endTime = getUtcStringForMixpanel()
        })
        playHintSound()
      } else {
        setWordState((state) => {
          state.letterStates[inputLength - 1] = 'correct'
        })
        playKeySound()
      }

      dispatch({ type: TypingStateActionType.REPORT_CORRECT_WORD })
    } else {
      // 出错时
      playBeepSound()
      setWordState((state) => {
        state.letterStates[inputLength - 1] = 'wrong'
        state.hasWrong = true
        state.hasMadeInputWrong = true
        state.wrongCount += 1
        state.letterTimeArray = []

        if (state.letterMistake[inputLength - 1]) {
          state.letterMistake[inputLength - 1].push(inputChar)
        } else {
          state.letterMistake[inputLength - 1] = [inputChar]
        }

        const currentState = JSON.parse(JSON.stringify(state))
        dispatch({ type: TypingStateActionType.REPORT_WRONG_WORD, payload: { letterMistake: currentState.letterMistake } })
      })

      if (currentChapter === 0 && state.chapterData.index === 0 && wordState.wrongCount >= 3) {
        setShowTipAlert(true)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wordState.inputWord])

  useEffect(() => {
    if (wordState.hasWrong) {
      const timer = setTimeout(() => {
        setWordState((state) => {
          state.inputWord = ''
          state.letterStates = new Array(state.letterStates.length).fill('normal')
          state.hasWrong = false
        })
      }, 300)

      return () => {
        clearTimeout(timer)
      }
    }
  }, [wordState.hasWrong, setWordState])

  useEffect(() => {
    if (wordState.isFinished) {
      dispatch({ type: TypingStateActionType.SET_IS_SAVING_RECORD, payload: true })

      wordLogUploader({
        headword: word.name,
        timeStart: wordState.startTime,
        timeEnd: wordState.endTime,
        countInput: wordState.correctCount + wordState.wrongCount,
        countCorrect: wordState.correctCount,
        countTypo: wordState.wrongCount,
      })
      saveWordRecord({
        word: word.name,
        wrongCount: wordState.wrongCount,
        letterTimeArray: wordState.letterTimeArray,
        letterMistake: wordState.letterMistake,
      })

      onFinish()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wordState.isFinished])

  useEffect(() => {
    if (wordState.wrongCount >= 4) {
      dispatch({ type: TypingStateActionType.SET_IS_SKIP, payload: true })
    }
  }, [wordState.wrongCount, dispatch])

  const parsedNotation = word.notation ? parseNotation(word.notation, word.name) : null

  return (
    <>
      <InputHandler updateInput={updateInput} />
      <div
        lang={currentLanguageCategory !== 'code' ? currentLanguageCategory : 'en'}
        className="flex flex-col items-center justify-center pb-1 pt-4"
      >
        <div
          className={`tooltip-info relative w-fit bg-transparent p-0 leading-normal shadow-none dark:bg-transparent ${
            wordDictationConfig.isOpen ? 'tooltip' : ''
          }`}
          data-tip="按 Tab 快捷键显示完整单词"
        >
          {['hapin'].includes(currentLanguage) && word.notation && <Notation notation={word.notation} />}
          <div
            onMouseEnter={() => handleHoverWord(true)}
            onMouseLeave={() => handleHoverWord(false)}
            className={`flex items-center ${isTextSelectable && 'select-all'} justify-center ${wordState.hasWrong ? style.wrong : ''}`}
          >
            {console.log(parsedNotation)}
            {parsedNotation
              ? parsedNotation.map((part, index) => {
                  // 检查这个片段的所有字母是否都正确
                  const currentLetterStates = wordState.letterStates.slice(part.romajiStart, part.romajiStart + part.romajiLength)

                  // 只有当前位置之前的字母状态才应该被考虑
                  const currentPosition = wordState.inputWord.length
                  const isCurrentPartActive = currentPosition > part.romajiStart
                  const isCurrentPartComplete = currentPosition >= part.romajiStart + part.romajiLength

                  // 判断当前部分的字母是否都正确
                  const allLettersCorrect =
                    isCurrentPartComplete && currentLetterStates.length > 0 && currentLetterStates.every((state) => state === 'correct')

                  // 可见性判断：
                  // 1. 如果默写模式关闭，直接显示
                  // 2. 如果默写模式开启：
                  //    - 所有字母都输入正确了，或者
                  //    - 用户在悬停查看答案
                  const isVisible = !wordDictationConfig.isOpen || allLettersCorrect || (isShowAnswerOnHover && isHoveringWord)

                  // console.log(`=== RubyLetter ${index} ===`, {
                  //   kanji: part.kanji,
                  //   furigana: part.furigana,
                  //   romajiLength: part.romajiLength,
                  //   currentRomajiIndex: Math.max(0, currentPosition - part.romajiStart),
                  //   letterStates: currentLetterStates,
                  //   visible: isVisible,
                  //   allLettersCorrect,
                  //   inputWordLength: currentPosition,
                  //   romajiStart: part.romajiStart,
                  //   isCurrentPartActive,
                  //   isCurrentPartComplete,
                  //   isDictationMode: wordDictationConfig.isOpen
                  // });

                  return (
                    <RubyLetter
                      key={index}
                      kanji={part.kanji}
                      furigana={part.furigana}
                      romajiLength={part.romajiLength}
                      currentRomajiIndex={Math.max(0, currentPosition - part.romajiStart)}
                      letterStates={currentLetterStates}
                      visible={isVisible}
                    />
                  )
                })
              : wordState.displayWord
                  .split('')
                  .map((t, index) => (
                    <Letter key={`${index}-${t}`} letter={t} visible={getLetterVisible(index)} state={wordState.letterStates[index]} />
                  ))}
          </div>
          {pronunciationIsOpen && (
            <div className="absolute -right-12 top-1/2 h-9 w-9 -translate-y-1/2 transform ">
              <Tooltip content={`快捷键${CTRL} + J`}>
                <WordPronunciationIcon word={word} lang={currentLanguage} ref={wordPronunciationIconRef} className="h-full w-full" />
              </Tooltip>
            </div>
          )}
        </div>
      </div>
      <TipAlert className="fixed bottom-10 right-3" show={showTipAlert} setShow={setShowTipAlert} />
    </>
  )
}
