module.exports = {
	norpc: true,
	copyPackages: ['openzeppelin-solidity'],
	testCommand: 'node --max-old-space-size=4096 ../node_modules/.bin/truffle test --network coverage',
	compileCommand: 'node --max-old-space-size=4096 ../node_modules/truffle/build/cli.bundled.js compile --all --network coverage',
	skipFiles: [
		'MockInclude.sol',
		'Migrations.sol',
	]
}
