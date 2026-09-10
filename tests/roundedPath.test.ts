import { describe, expect, test } from 'bun:test';
import { roundedPath } from '../src/components/graphViewer/geometry/roundedPath';

describe('organic route fillets', () => {
	test('preserves endpoints and tangents at a right angle', () => {
		const path = roundedPath(
			[
				{ x: 0, y: 0 },
				{ x: 100, y: 0 },
				{ x: 100, y: 100 }
			],
			() => true
		);
		expect(path).toBe(
			'M 0.000,0.000 L 52.000,0.000 C 78.510,0.000 100.000,21.490 100.000,48.000 L 100.000,100.000'
		);
	});
	test('keeps the safe original corner when every fillet is blocked', () => {
		const path = roundedPath(
			[
				{ x: 0, y: 0 },
				{ x: 100, y: 0 },
				{ x: 100, y: 100 }
			],
			() => false
		);
		expect(path).toBe('M 0.000,0.000 L 100.000,0.000 L 100.000,100.000');
	});
	test('handles empty routes and repeated points without invalid coordinates', () => {
		expect(roundedPath([], () => true)).toBe('');
		expect(
			roundedPath(
				[
					{ x: 0, y: 0 },
					{ x: 0, y: 0 },
					{ x: 20, y: 0 }
				],
				() => true
			)
		).toBe('M 0.000,0.000 L 20.000,0.000');
	});
});

test('arrival tangent follows the shared continuation without moving the join', () => {
	const path = roundedPath(
		[
			{ x: 0, y: 0 },
			{ x: 100, y: 100 }
		],
		() => true,
		{ x: 0, y: 1 }
	);
	const values = path.split('C').at(-1)!.trim().split(/[ ,]+/).map(Number);
	expect(values.at(-2)).toBe(100);
	expect(values.at(-1)).toBe(100);
	expect(values[2]).toBe(100);
	expect(values[3]).toBeLessThan(100);
});
