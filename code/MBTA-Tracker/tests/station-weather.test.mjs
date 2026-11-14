import test from 'node:test';
import assert from 'node:assert/strict';
import { journeyWeatherTiming } from '../lib/journey-timing.mjs';
import { createWeatherHandler } from '../server/weather/weather-handler.mjs';

const now = Date.parse('2026-11-14T17:00:00Z');
const at = minutes => new Date(now + minutes * 60000).toISOString();
const stop = id => ({ id, platforms: [] });
const leg = (from, to) => ({ route: 'Red', routes: ['Red'], direction: 0, stops: [stop(from), stop(to)] });
const record = (id, minutes, sequence, trip = 't') => ({ id: `${trip}:${id}`, serviceDate: '2026-11-14',
  attributes: { arrival_time: at(minutes), departure_time: at(minutes), direction_id: 0, stop_sequence: sequence },
  relationships: { stop: { data: { id } }, route: { data: { id: 'Red' } }, trip: { data: { id: trip } } } });
const snapshot = records => ({ data: { predictions: { data: records }, predictionsCheckedAt: now,
  alerts: { data: [] }, alertsCheckedAt: now } });
const journey = { legs: [leg('a','b')], walks: [] };

test('departure and destination weather use distinct requested and same-trip arrival times', () => {
  const result = journeyWeatherTiming(journey, snapshot([record('a',5,1), record('b',25,2)]), now+120000, false, now);
  assert.equal(result.departure, now + 120000);
  assert.equal(result.arrival, now + 25*60000);
});
test('missing, stale and walking-transfer journeys never invent arrival times', () => {
  assert.equal(journeyWeatherTiming(journey, snapshot([record('a',5,1)]), null, false, now).arrival, null);
  const stale = snapshot([record('a',5,1),record('b',25,2)]);
  stale.data.predictionsCheckedAt = now-100000;
  assert.equal(journeyWeatherTiming(journey, stale, null, false, now).arrival, null);
  assert.equal(journeyWeatherTiming({...journey,walks:[{}]}, snapshot([]), null, false, now).arrival, null);
});
test('transfers require an arrival for every leg and filter missed connections', () => {
  const trip = {legs:[leg('a','b'),leg('b','c')],walks:[]};
  const data = snapshot([record('a',5,1),record('b',25,2),record('b',20,1,'early'),record('c',30,2,'early'),record('b',28,1,'later'),record('c',40,2,'later')]);
  data.data.predictions.data[1].attributes.departure_time = null; // First train terminates at the transfer station.
  assert.equal(journeyWeatherTiming(trip,data,null,false,now).arrival,now+40*60000);
  assert.equal(journeyWeatherTiming(trip,snapshot(data.data.predictions.data.slice(2)),null,false,now).arrival,null);
});
test('planned journeys derive arrival from the timetable', () => {
  const data = {data:{alerts:{data:[]},alertsCheckedAt:now,schedulesCheckedAt:now,
    schedules:{data:[record('a',45,1),record('b',65,2)],departureBefore:now+7200000}}};
  assert.equal(journeyWeatherTiming(journey,data,now+40*60000,true,now).arrival,now+65*60000);
});
test('endpoint passes each station and its own time through the existing regional service', async () => {
  const calls=[];
  const service={getWeatherForStation:id=>({status:id==='missing'?'unknown_station':'fresh'}),
    startWeatherRefresh:async()=>{},getWeatherStatus:()=>({refreshing:false}),
    getForecastForStation:(id,time)=>{calls.push([id,time.getTime()]);return {stationId:id,regionId:id==='a'?'group-a':'group-b',forecast:{temperature:id==='a'?5:7}};}};
  const get=createWeatherHandler(service,()=>now);
  const a=await (await get(new Request(`http://local/api/weather?station=a&time=${now+300000}`))).json();
  const b=await (await get(new Request(`http://local/api/weather?station=b&time=${now+1500000}`))).json();
  assert.notEqual(a.regionId,b.regionId);
  assert.deepEqual(calls,[['a',now+300000],['b',now+1500000]]);
  assert.equal((await get(new Request('http://local/api/weather?station=a&time=no'))).status,400);
  assert.equal((await (await get(new Request('http://local/api/weather?station=missing'))).json()).status,'unknown_station');
});
