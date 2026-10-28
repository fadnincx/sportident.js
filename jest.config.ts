import type {Config} from 'jest';

const totalCoverage = {
    branches: 100,
    functions: 100,
    lines: 100,
    statements: 100,
};

const percentCoverage = (percent: number) => ({
    branches: percent,
    functions: percent,
    lines: percent,
    statements: percent,
})

const jestConfig: Config = {
    transform: {
        '^.+\\.tsx?$': 'ts-jest',
    },
    testEnvironment: 'jsdom',
    testRegex: '.*/.*\\.test\\.tsx?',
    testPathIgnorePatterns: ['node_modules/', 'lib/', '__snapshots__/', 'testUtils/'],
    collectCoverage: true,
    collectCoverageFrom: [
        './**/src/**/*',
    ],
    coveragePathIgnorePatterns: ['node_modules/', 'lib/', '__snapshots__/', 'testUtils/'],
    maxConcurrency: 1,
    coverageThreshold: {
        global: percentCoverage(10),
        './src/': {
            branches: 92,
            functions: 89,
            lines: 89,
            statements: 88,
        },
        './src/SiCard': percentCoverage(92),
        './src/SiDevice': percentCoverage(44),
        // Jest counts a file against EVERY matching threshold group, so these files are
        // also measured against './src/' below; keep branches at or above its 92.
        './src/SiReaderBt': {
            branches: 92,
            functions: 90,
            lines: 90,
            statements: 90,
        },
        './src/SiReaderBt/readerBtProtocol.ts': totalCoverage,
        './src/fakes': percentCoverage(43),
        './src/SiStation': percentCoverage(83),
        './src/storage': totalCoverage,
        './src/utils': totalCoverage,
        './src/constants.ts': totalCoverage,
        './src/siProtocol.ts': totalCoverage,
        './src/testUtils.ts': totalCoverage,
    },
};
export default jestConfig;
