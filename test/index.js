import computeEtag from 'etag'
import {strictEqual as sEqual} from 'assert'
import {createServer, get} from 'http'
import {api} from '../api.js'
import {
	stopPolling,
	facilitiesSource,
	parseAccessibilityCloudResponse,
} from '../lib/facilities.js'

import {createRequire} from 'module'
const require = createRequire(import.meta.url)
// Node.js currently only allows importing JSON files with --experimental-json-modules,
// so we use require() here.
const facilities20211123 = require('./accessibility-cloud-facilities-2021-11-23T15:16+01.json')

// don't try to poll the actual data source
stopPolling()

const pGet = (url, opt = {}) => {
	return new Promise((resolve, reject) => {
		let bodyChunks = []
		const req = get(url, {
			timeout: 5 * 1000,
			...opt,
		}, (res) => {
			res.once('error', reject)
			res.on('data', (c) => {
				bodyChunks.push(c)
			})
			res.once('end', () => resolve({
				res,
				body: Buffer.concat(bodyChunks),
			}))
		})
		req.once('error', reject)
	})
}

const assertBasicHeaders = (res, msgPrefix) => {
	sEqual(res.headers['accept-ranges'], 'bytes', msgPrefix + ': invalid "accept-ranges" header')
	sEqual(res.headers['cache-control'], 'public, max-age=0', msgPrefix + ': invalid "cache-control" header')
	sEqual(res.headers['vary'], 'accept-encoding', msgPrefix + ': invalid "vary" header')
}

const runTests = async (server) => {
	const {port} = server.address()
	const baseUrl = `http://localhost:${port}`

	{
		const fetchedAt = Date.parse('2021-11-11T11:11+01:00')
		const lastModified = new Date(fetchedAt).toUTCString()

		facilitiesSource.emit('data', [{
			id: 'foo',
			pathwayId: 'p1',
			isWorking: true,
			lastUpdatedAt: Date.parse('2021-10-10T10:10+01:00'),
		}, {
			id: 'bar',
			pathwayId: 'p2',
			isWorking: false,
			lastUpdatedAt: Date.parse('2021-09-09T09:09+01:00'),
		}], fetchedAt)

		const gtfsRtBody = Buffer.from(`\
0a0d0a03322e30100018b4d8b38c06120e0a02653032080a040a0270311000120e0a02653132080\
a040a0270321000`, 'hex')
		const gtfsRtEtag = computeEtag(gtfsRtBody)

		const pathwayEvolutionsBody = Buffer.from(`\
"pathway_id","service_id","start_time","end_time","is_closed","direction"
"p1",,,,"1",
"p2",,,,"0",
`, 'utf8')
		const pathwayEvolutionsEtag = computeEtag(pathwayEvolutionsBody)

		const calendarDatesBody = Buffer.from(`\
"service_id","date","exception_type"
`, 'utf8')
		const calendarDatesEtag = computeEtag(calendarDatesBody)

		{
			const {res, body} = await pGet(baseUrl + '/feed', {
				method: 'HEAD',
			})
			assertBasicHeaders(res, 'HEAD /feed')
			sEqual(res.headers['content-type'], 'application/octet-stream', 'HEAD /feed: invalid "content-type" header')
			sEqual(res.headers['last-modified'], lastModified, 'HEAD /feed: invalid "last-modified" header')
			sEqual(res.headers['etag'], gtfsRtEtag, 'HEAD /feed: invalid "etag" header')
			sEqual(res.headers['content-length'], gtfsRtBody.length + '', 'HEAD /feed: invalid "content-length" header')
			sEqual(body.toString(), '', 'HEAD /feed: buffer should be empty')
		}
		{
			const {res, body} = await pGet(baseUrl + '/feed')
			assertBasicHeaders(res, 'GET /feed')
			sEqual(body.toString(), gtfsRtBody.toString(), 'GET /feed body should be equal')
		}

		{
			const {res, body} = await pGet(baseUrl + '/pathway_evolutions.csv', {
				method: 'HEAD',
			})
			assertBasicHeaders(res, 'HEAD /pathway_evolutions.csv')
			sEqual(res.headers['content-type'], 'text/csv', 'HEAD /pathway_evolutions.csv: invalid "content-type" header')
			sEqual(res.headers['last-modified'], lastModified, 'HEAD /pathway_evolutions.csv: invalid "last-modified" header')
			sEqual(res.headers['etag'], pathwayEvolutionsEtag, 'HEAD /pathway_evolutions.csv: invalid "etag" header')
			sEqual(res.headers['content-length'], pathwayEvolutionsBody.length + '', 'HEAD /pathway_evolutions.csv: invalid "content-length" header')
			sEqual(body.toString(), '', 'HEAD /pathway_evolutions.csv: buffer should be empty')
		}
		{
			const {res, body} = await pGet(baseUrl + '/pathway_evolutions.csv')
			assertBasicHeaders(res, 'GET /pathway_evolutions.csv')
			sEqual(body.toString(), pathwayEvolutionsBody.toString(), 'GET /pathway_evolutions.csv: body should be equal')
		}

		{
			const {res, body} = await pGet(baseUrl + '/calendar_dates.csv', {
				method: 'HEAD',
			})
			assertBasicHeaders(res, 'HEAD /calendar_dates.csv')
			sEqual(res.headers['content-type'], 'text/csv', 'HEAD /calendar_dates.csv: invalid "content-type" header')
			sEqual(res.headers['last-modified'], lastModified, 'HEAD /calendar_dates.csv: invalid "last-modified" header')
			sEqual(res.headers['etag'], calendarDatesEtag, 'HEAD /calendar_dates.csv: invalid "etag" header')
			sEqual(res.headers['content-length'], calendarDatesBody.length + '', 'HEAD /calendar_dates.csv: invalid "content-length" header')
			sEqual(body.toString(), '', 'HEAD /calendar_dates.csv: buffer should be empty')
		}
		{
			const {res, body} = await pGet(baseUrl + '/calendar_dates.csv')
			assertBasicHeaders(res, 'GET /calendar_dates.csv')
			sEqual(body.toString(), calendarDatesBody.toString(), 'GET /calendar_dates.csv: body should be equal')
		}
	}

	{
		const fetchedAt = Date.parse('2021-11-23T15:16+01:00')
		const lastModified = new Date(fetchedAt).toUTCString()
		const facilities = parseAccessibilityCloudResponse(facilities20211123)
		facilitiesSource.emit('data', facilities, fetchedAt)

		// these have been approved by manual inspection of the bodies
		const gtfsRtEtag = '"8089-WRowZ9uV2SUqkZx4D7I+LxzoKzw"'
		const pathwayEvolutionsEtag = '"6dc1-+9dghC8h1NojRoNOvtHzJSXv3jk"'
		const calendarDatesEtag = '"4c-CFmCuS1XYLWywY0Ct1cTF+G1CGc"'

		{
			const {res} = await pGet(baseUrl + '/feed', {
				method: 'HEAD',
			})
			assertBasicHeaders(res, '2021-11-23 facilities – HEAD /feed')
			sEqual(res.headers['etag'], gtfsRtEtag, '2021-11-23 facilities – HEAD /feed: invalid "etag" header')
		}

		{
			const {res, body} = await pGet(baseUrl + '/pathway_evolutions.csv', {
				method: 'HEAD',
			})
			assertBasicHeaders(res, '2021-11-23 facilities – HEAD /pathway_evolutions.csv')
			sEqual(res.headers['etag'], pathwayEvolutionsEtag, '2021-11-23 facilities – HEAD /pathway_evolutions.csv: invalid "etag" header')
		}

		{
			const {res, body} = await pGet(baseUrl + '/calendar_dates.csv', {
				method: 'HEAD',
			})
			assertBasicHeaders(res, '2021-11-23 facilities – HEAD /calendar_dates.csv')
			sEqual(res.headers['etag'], calendarDatesEtag, '2021-11-23 facilities – HEAD /calendar_dates.csv: invalid "etag" header')
		}
	}

	console.error('looks good ✔︎')
}

const abortWithError = (err) => {
	console.error(err)
	process.exit(1)
}

const server = createServer(api)
server.listen((err) => {
	if (err) abortWithError(err)

	runTests(server)
	.then(() => {
		server.close()
	}, abortWithError)
})
