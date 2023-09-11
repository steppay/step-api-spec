import {
    areComponentsEqual,
    getSpecPathByServiceName,
    replaceValueRecursive,
    replaceEnumRecursive,
    renameField,
} from './utils.mjs'
import { describe, it, expect } from '@jest/globals'

describe('getSpecPathByServiceName 함수 테스트', () => {
    it('기본적으로는 현재 디렉토리의 json 파일을 리턴한다', () => {
        expect(getSpecPathByServiceName('product')).toBe('./product.json')
    })

    it('prefix 가 있으면 합쳐서 json 파일을 리턴한다', () => {
        expect(getSpecPathByServiceName('product', './specs')).toBe('./specs/product.json')
    })
})

describe('areComponentsEqual 함수 테스트', () => {
    it('순서가 달라도 같은 이름만 같으면 같다고 판단한다', () => {
        const component1 = {
            a: 1,
            b: 2,
        }
        const component2 = {
            b: 2,
            a: 1,
        }
        expect(areComponentsEqual(component1, component2)).toBe(true)
    })
})

describe('replaceEnumRecursive 함수 테스트', () => {
    it('타겟 배열이 일치하는 enum 속성의 값을 변경한다', () => {
        const input = { a: 1, b: 'test', enum: [1, 2, 3], c: { d: 'inner', enum: [1, 2, 3] } }
        const expected = { a: 1, b: 'test', enum: 'new', c: { d: 'inner', enum: 'new' } }

        expect(replaceEnumRecursive(input, [1, 2, 3], 'new')).toEqual(expected)
    })

    it('타겟 배열이 일치하지 않는 경우 객체는 변경되지 않는다', () => {
        const input = { a: 1, b: 'test', enum: [1, 2, 3], c: { d: 'inner', enum: [1, 2, 3] } }

        expect(replaceEnumRecursive(input, [4, 5, 6], 'new')).toEqual(input)
    })

    it('enum 속성이 배열이 아닌 경우 객체는 변경되지 않는다', () => {
        const input = { a: 1, b: 'test', enum: 'not array', c: { d: 'inner', enum: 'not array' } }

        expect(replaceEnumRecursive(input, ['not array'], 'new')).toEqual(input)
    })
})

describe('renameField 함수 테스트', () => {
    it('원래 필드 이름이 존재하면 새 필드 이름으로 변경한다', () => {
        const input = { a: 1, b: 'test' }
        const expected = { a: 1, newField: 'test' }

        expect(renameField({ ...input }, 'b', 'newField')).toEqual(expected)
    })

    it('원래 필드 이름이 존재하지 않으면 객체는 변경되지 않는다', () => {
        const input = { a: 1, b: 'test' }

        expect(renameField({ ...input }, 'c', 'newField')).toEqual(input)
    })

    it('새 필드 이름이 이미 존재하는 경우, 해당 필드는 덮어쓰기 된다', () => {
        const input = { a: 1, b: 'test', newField: 'original' }
        const expected = { a: 1, newField: 'test' }

        expect(renameField({ ...input }, 'b', 'newField')).toEqual(expected)
    })
})

describe('replaceValueRecursive 함수 테스트', () => {
    it('객체 내의 모든 값을 검사하여 변경한다', () => {
        let obj = {
            a: '123',
            b: '123',
            sub: {
                c: '123',
            },
        }
        obj = replaceValueRecursive(obj, '123', '456')
        expect(obj).toEqual({
            a: '456',
            b: '456',
            sub: {
                c: '456',
            },
        })
    })
})
