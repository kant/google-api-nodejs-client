// Copyright 2013-2016, Google, Inc.
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import * as assert from 'assert';
import * as fs from 'fs';
import * as nock from 'nock';
import * as path from 'path';
import * as pify from 'pify';
import * as url from 'url';
import {GoogleApis} from '../src';
import {Utils} from './utils';

function createNock(qs?: string) {
  const query = qs ? `?${qs}` : '';
  nock('https://datastore.googleapis.com')
      .post(`/v1beta3/projects/test-project-id:lookup${query}`)
      .reply(200);
}

describe('Clients', () => {
  let localPlus, remotePlus;
  let localOauth2, remoteOauth2;

  before(async () => {
    nock.cleanAll();
    const google = new GoogleApis();
    nock.enableNetConnect();
    [remotePlus, remoteOauth2] = await Promise.all([
      Utils.loadApi(google, 'plus', 'v1'), Utils.loadApi(google, 'oauth2', 'v2')
    ]);
    nock.disableNetConnect();
  });

  beforeEach(() => {
    nock.cleanAll();
    nock.disableNetConnect();
    const google = new GoogleApis();
    localPlus = google.plus('v1');
    localOauth2 = google.oauth2('v2');
  });

  it('should create request helpers according to resource on discovery API response',
     () => {
       let plus = localPlus;
       assert.equal(typeof plus.people.get, 'function');
       assert.equal(typeof plus.activities.search, 'function');
       assert.equal(typeof plus.comments.list, 'function');
       plus = remotePlus;
       assert.equal(typeof plus.people.get, 'function');
       assert.equal(typeof plus.activities.search, 'function');
       assert.equal(typeof plus.comments.list, 'function');
     });

  it('should be able to gen top level methods', () => {
    assert.equal(typeof localOauth2.tokeninfo, 'function');
    assert.equal(typeof remoteOauth2.tokeninfo, 'function');
  });

  it('should be able to gen top level methods and resources', () => {
    let oauth2 = localOauth2;
    assert.equal(typeof oauth2.tokeninfo, 'function');
    assert.equal(typeof oauth2.userinfo, 'object');
    oauth2 = remoteOauth2;
    assert.equal(typeof oauth2.tokeninfo, 'function');
    assert.equal(typeof oauth2.userinfo, 'object');
  });

  it('should be able to gen nested resources and methods', () => {
    let oauth2 = localOauth2;
    assert.equal(typeof oauth2.userinfo, 'object');
    assert.equal(typeof oauth2.userinfo.v2, 'object');
    assert.equal(typeof oauth2.userinfo.v2.me, 'object');
    assert.equal(typeof oauth2.userinfo.v2.me.get, 'function');
    oauth2 = remoteOauth2;
    assert.equal(typeof oauth2.userinfo, 'object');
    assert.equal(typeof oauth2.userinfo.v2, 'object');
    assert.equal(typeof oauth2.userinfo.v2.me, 'object');
    assert.equal(typeof oauth2.userinfo.v2.me.get, 'function');
  });

  it('should be able to require all api files without error', () => {
    function getFiles(dir: string, files?: string[]) {
      files = files || [];
      if (typeof files === 'undefined') {
        files = [];
      }
      const files2 = fs.readdirSync(dir);
      for (const i in files2) {
        if (!files2.hasOwnProperty(i)) {
          continue;
        }
        const name = dir + '/' + files2[i];
        if (fs.statSync(name).isDirectory()) {
          getFiles(name, files);
        } else {
          if (path.extname(name) === '.js') {
            files.push(name);
          }
        }
      }
      return files;
    }

    const apiFiles = getFiles(path.join(__dirname, '/../src/apis'));

    assert.doesNotThrow(() => {
      for (const i in apiFiles) {
        if (apiFiles.hasOwnProperty(i)) {
          try {
            require(apiFiles[i]);
          } catch (err) {
            console.error(err);
            throw err;
          }
        }
      }
    });
  });

  it('should support default params', async () => {
    const google = new GoogleApis();
    const datastore =
        google.datastore({version: 'v1beta3', params: {myParam: '123'}});
    createNock('myParam=123');
    const res =
        await pify(datastore.projects.lookup)({projectId: 'test-project-id'});
    // If the default param handling is broken, query might be undefined, thus
    // concealing the assertion message with some generic "cannot call .indexOf
    // of undefined"
    const query = Utils.getQs(res) || '';
    assert.notEqual(query.indexOf('myParam=123'), -1, 'Default param in query');
    nock.enableNetConnect();
    const datastore2 = await Utils.loadApi(
        google, 'datastore', 'v1beta3', {params: {myParam: '123'}});
    nock.disableNetConnect();
    createNock('myParam=123');
    const res2 =
        // tslint:disable-next-line no-any
        await pify((datastore2 as any).projects.lookup)(
            {projectId: 'test-project-id'});
    const query2 = Utils.getQs(res2) || '';
    assert.notEqual(
        query2.indexOf('myParam=123'), -1, 'Default param in query');
  });

  it('should allow default params to be overriden per-request', async () => {
    const google = new GoogleApis();
    const datastore =
        google.datastore({version: 'v1beta3', params: {myParam: '123'}});
    // Override the default datasetId param for this particular API call
    createNock('myParam=456');
    const res = await pify(datastore.projects.lookup)(
        {projectId: 'test-project-id', myParam: '456'});
    // If the default param handling is broken, query might be undefined, thus
    // concealing the assertion message with some generic "cannot call .indexOf
    // of undefined"
    const query = Utils.getQs(res) || '';
    assert.notEqual(
        query.indexOf('myParam=456'), -1, 'Default param not found in query');
    nock.enableNetConnect();
    const datastore2 = await Utils.loadApi(
        google, 'datastore', 'v1beta3', {params: {myParam: '123'}});
    nock.disableNetConnect();
    // Override the default datasetId param for this particular API call
    createNock('myParam=456');
    // tslint:disable-next-line no-any
    const res2 = await pify((datastore2 as any).projects.lookup)(
        {projectId: 'test-project-id', myParam: '456'});
    // If the default param handling is broken, query might be undefined,
    // thus concealing the assertion message with some generic "cannot
    // call .indexOf of undefined"
    const query2 = Utils.getQs(res2) || '';
    assert.notEqual(
        query2.indexOf('myParam=456'), -1, 'Default param not found in query');
  });

  it('should include default params when only callback is provided to API call',
     async () => {
       const google = new GoogleApis();
       const datastore = google.datastore({
         version: 'v1beta3',
         params: {
           projectId: 'test-project-id',  // We must set this here - it is a
           // required param
           myParam: '123'
         }
       });
       // No params given - only callback
       createNock('myParam=123');
       const res = await pify(datastore.projects.lookup)();
       // If the default param handling is broken, req or query might be
       // undefined, thus concealing the assertion message with some generic
       // "cannot call .indexOf of undefined"
       const query = Utils.getQs(res) || '';

       assert.notEqual(
           query.indexOf('myParam=123'), -1,
           'Default param not found in query');

       nock.enableNetConnect();
       const datastore2 = await Utils.loadApi(google, 'datastore', 'v1beta3', {
         params: {
           projectId: 'test-project-id',  // We must set this here - it is a
           // required param
           myParam: '123'
         }
       });

       nock.disableNetConnect();

       // No params given - only callback
       createNock('myParam=123');
       // tslint:disable-next-line no-any
       const res3 = await pify((datastore2 as any).projects.lookup)();
       // If the default param handling is broken, req or query might be
       // undefined, thus concealing the assertion message with some
       // generic "cannot call .indexOf of undefined"
       const query2 = Utils.getQs(res3) || '';
       assert.notEqual(
           query2.indexOf('myParam=123'), -1,
           'Default param not found in query');
     });

  after(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });
});
