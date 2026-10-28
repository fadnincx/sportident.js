import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import { LogLevel, getDefaultLogLevel, setDefaultLogLevel } from '../utils/logging';
import * as testUtils from '../testUtils';
import { msg } from './readerBtConstants';
import { renderRequest } from './readerBtProtocol';
import { ReaderBtRequestTask, ReaderBtRequestTaskState, ReaderBtTimeoutError } from './ReaderBtRequestTask';

testUtils.useFakeTimers();

let previousLogLevel: LogLevel;
beforeAll(() => {
	previousLogLevel = getDefaultLogLevel();
	setDefaultLogLevel(LogLevel.ERROR);
});
afterAll(() => {
	setDefaultLogLevel(previousLogLevel);
});

interface Outcome {
	succeeded: ReaderBtRequestTask[];
	failed: { task: ReaderBtRequestTask; error: unknown }[];
}

const makeTask = (totalTimeoutMs = 1000, idleTimeoutMs = 500): { task: ReaderBtRequestTask; outcome: Outcome } => {
	const outcome: Outcome = { succeeded: [], failed: [] };
	const task = new ReaderBtRequestTask(
		'readSettings',
		renderRequest(msg.READ_ALL_SETTINGS),
		msg.READ_ALL_SETTINGS,
		{ totalTimeoutMs: totalTimeoutMs, idleTimeoutMs: idleTimeoutMs },
		(succeeded) => outcome.succeeded.push(succeeded),
		(failed, error) => outcome.failed.push({ task: failed, error: error })
	);
	return { task: task, outcome: outcome };
};

describe('ReaderBtRequestTask', () => {
	test('starts queued', () => {
		const { task } = makeTask();
		expect(task.state).toEqual(ReaderBtRequestTaskState.Queued);
		expect(task.isSettled).toBe(false);
	});

	test('succeeds when a response arrives', () => {
		const { task, outcome } = makeTask();
		task.start();
		task.markInFlight();
		task.addResponse({ messageId: msg.READ_ALL_SETTINGS, payload: [1] });
		expect(task.state).toEqual(ReaderBtRequestTaskState.Succeeded);
		expect(task.response).toEqual({ messageId: msg.READ_ALL_SETTINGS, payload: [1] });
		expect(outcome.succeeded).toEqual([task]);
	});

	test('fires the total timeout even if it is never written', async () => {
		const { task, outcome } = makeTask();
		task.start();
		await testUtils.advanceTimersByTimeAsync(1000);
		expect(outcome.failed[0].error).toBeInstanceOf(ReaderBtTimeoutError);
		expect(task.state).toEqual(ReaderBtRequestTaskState.Failed);
	});

	test('the idle timeout only starts once the task is in flight', async () => {
		const { task, outcome } = makeTask(10000, 500);
		task.start();
		await testUtils.advanceTimersByTimeAsync(2000);
		expect(outcome.failed).toEqual([]);
		task.markInFlight();
		await testUtils.advanceTimersByTimeAsync(500);
		expect(outcome.failed[0].error).toBeInstanceOf(ReaderBtTimeoutError);
	});

	test('noteProgress refreshes the idle deadline', async () => {
		const { task, outcome } = makeTask(10000, 500);
		task.start();
		task.markInFlight();
		await testUtils.nTimesAsync(5, async () => {
			await testUtils.advanceTimersByTimeAsync(400);
			task.noteProgress();
		});
		expect(outcome.failed).toEqual([]);
		await testUtils.advanceTimersByTimeAsync(500);
		expect(outcome.failed[0].error).toBeInstanceOf(ReaderBtTimeoutError);
	});

	test('can settle without ever having been started', () => {
		const { task, outcome } = makeTask();
		task.succeed();
		expect(outcome.succeeded).toEqual([task]);
	});

	test('clears its timers once settled', async () => {
		const { task, outcome } = makeTask();
		task.start();
		task.markInFlight();
		task.succeed();
		await testUtils.advanceTimersByTimeAsync(10000);
		expect(outcome.failed).toEqual([]);
		expect(outcome.succeeded).toHaveLength(1);
	});

	describe('guards against settling twice', () => {
		test('addResponse after settling is ignored', () => {
			const { task, outcome } = makeTask();
			task.start();
			task.succeed();
			task.addResponse({ messageId: msg.READ_ALL_SETTINGS, payload: [9] });
			expect(task.response).toBeUndefined();
			expect(outcome.succeeded).toHaveLength(1);
		});

		test('succeed after settling is ignored', () => {
			const { task, outcome } = makeTask();
			task.start();
			task.succeed();
			task.succeed();
			expect(outcome.succeeded).toHaveLength(1);
		});

		test('fail after settling is ignored', () => {
			const { task, outcome } = makeTask();
			task.start();
			task.succeed();
			task.fail(new Error('too late'));
			expect(outcome.failed).toEqual([]);
			expect(task.state).toEqual(ReaderBtRequestTaskState.Succeeded);
		});

		test('succeed after failing is ignored', () => {
			const { task, outcome } = makeTask();
			task.start();
			task.fail(new Error('nope'));
			task.succeed();
			expect(outcome.succeeded).toEqual([]);
			expect(task.state).toEqual(ReaderBtRequestTaskState.Failed);
		});

		test('noteProgress after settling is ignored', async () => {
			const { task, outcome } = makeTask(10000, 500);
			task.start();
			task.markInFlight();
			task.succeed();
			task.noteProgress();
			await testUtils.advanceTimersByTimeAsync(10000);
			expect(outcome.failed).toEqual([]);
		});
	});
});
