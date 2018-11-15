import { expect, assert } from 'chai';
import * as sinon from 'sinon';
import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';

chai.use(chaiAsPromised);

describe('snippets', function() {
    beforeEach(function() {});
    afterEach(function() {});

    it('define variable', async function() {
        assert.isTrue(true);
    });
});
