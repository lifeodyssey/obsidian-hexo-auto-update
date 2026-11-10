import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { releasePlan, publish, verifyRequest, verifyAssets } from './release.mjs';
const sha = 'a'.repeat(40);
const other = 'b'.repeat(40);
const options = { repository:'owner/repo', version:'2.0.2', channel:'prerelease', sha, notes:'release-notes/2.0.2.md', assets:[{path:'dist/main.js',name:'main.js',size:2,digest:'sha256:test'}] };
const draft = {draft:true,prerelease:true,target_commitish:sha,tag_name:options.version,assets:[]};
const cfg = {version:options.version,channel:'prerelease',notes:options.notes};
const pkg = {version:options.version};
const manifest = {...pkg,minAppVersion:'0.15.0'};
const versions = {[pkg.version]:manifest.minAppVersion};
const nf = () => Object.assign(new Error('not found'),{stderr:'gh: Not Found (HTTP 404)'});
function fake(release = draft, refs = `${sha}\trefs/tags/2.0.2`) {
    const calls=[]; let current=release;
    const run=(cmd,args)=>{
        calls.push([cmd,...args]);
        if(cmd==='git') return typeof refs==='function'?refs(calls):refs;
        if(args[0]==='api') {
            if(args[1].includes('/commits/')) return JSON.stringify({sha: current.target_commitish});
            if(current instanceof Error) throw current;
            return JSON.stringify(current);
        }
        if(args[1]==='create') current={...draft,prerelease:args.includes('--prerelease')};
        if(args[1]==='upload') current={...current,assets:options.assets};
        if(args[1]==='edit') current={...current,draft:false};
        return '';
    };
    return {run,calls};
}
test('explicit tag validates version, channel and compatibility',()=>assert.deepEqual(releasePlan(pkg,manifest,cfg,versions,pkg.version),{version:pkg.version,channel:'prerelease'}));
test('publication requires explicit main dispatch and isolates build credentials',()=>{
    const workflow=readFileSync(new URL('../.github/workflows/release.yml',import.meta.url),'utf8');
    assert.match(workflow,/workflow_dispatch:/); assert.doesNotMatch(workflow,/push:/);
    assert.match(workflow,/needs: build/); assert.match(workflow,/github.ref == 'refs\/heads\/main'/);
    const publisher=workflow.split('  publish:')[1];
    assert.doesNotMatch(publisher,/npm ci|npm run/);
    assert.match(publisher,/node ..\/trusted\/scripts\/release.mjs publish/);
    assert.equal((workflow.match(/persist-credentials: false/g)||[]).length,4);
});
test('untrusted commit, wrong tag and non-SHA requests fail closed',()=>{
    assert.throws(()=>verifyRequest('owner/repo','2.0.2','main',sha),/request/);
    assert.throws(()=>verifyRequest('owner/repo','2.0.2',sha,other,(cmd,args)=>{if(args[0]==='merge-base')throw Error('not main history');}),/main history/);
    assert.throws(()=>verifyRequest('owner/repo','2.0.2',sha,sha,()=>`${other}\trefs/tags/2.0.2`),/tag/);
});
test('missing or mismatched compatibility fails',()=>{
    assert.throws(()=>releasePlan(pkg,manifest,cfg,{},pkg.version),/compatibility/);
    assert.throws(()=>releasePlan(pkg,manifest,cfg,{[pkg.version]:'9.0.0'},pkg.version),/compatibility/);
});
test('wrong tag, package, channel, notes or metadata versions fail during plan',()=>{
    assert.throws(()=>releasePlan(pkg,manifest,cfg,versions,'2.0.3'),/tag/);
    assert.throws(()=>releasePlan(pkg,{...manifest,version:'1.0.0'},cfg,versions,pkg.version),/differ/);
    assert.throws(()=>releasePlan(pkg,manifest,{...cfg,channel:'other'},versions,pkg.version),/channel/);
    assert.throws(()=>releasePlan(pkg,manifest,{...cfg,notes:'SECURITY_DEPENDENCIES.md'},versions,pkg.version),/notes/);
    assert.throws(()=>releasePlan({version:'2.0.2+build.1'},manifest,cfg,versions,'2.0.2+build.1'),/numeric/);
});
test('fresh publication uses a pre-existing verified tag and rereads created draft',()=>{
    const f=fake(nf()); publish(options,f.run);
    assert.ok(f.calls.find(c=>c[2]==='create').includes('--verify-tag'));
    assert.ok(f.calls.find(c=>c[2]==='edit').includes('--draft=false'));
    assert.equal(f.calls.filter(c=>c[1]==='api'&&c[2].includes('/releases/')).length,4);
});
test('matching partial draft resumes',()=>{const f=fake();publish(options,f.run);assert.ok(f.calls.find(c=>c[2]==='upload').includes('--clobber'));});
test('draft wrong channel is blocked before any asset mutation',()=>{
    const f=fake({...draft,prerelease:false});assert.throws(()=>publish(options,f.run),/channel/);assert.ok(!f.calls.some(c=>c[2]==='upload'||c[2]==='edit'));
});
test('draft wrong target or missing target fails even when tag matches',()=>{
    for(const target_commitish of [other,undefined,'main']) assert.throws(()=>publish(options,fake({...draft,target_commitish}).run),/target/);
});
test('missing or wrong existing tag is blocked, no automatic tag creation',()=>{
    for(const refs of ['',`${other}\trefs/tags/2.0.2`]) assert.throws(()=>publish(options,fake(draft,refs).run),/tag/);
});
test('annotated tag peels to correct commit',()=>publish(options,fake(draft,`${other}\trefs/tags/2.0.2\n${sha}\trefs/tags/2.0.2^{}`).run));
test('tag changed after release lookup is caught before upload',()=>{
    let n=0;const f=fake(draft,()=>`${++n===1?sha:other}\trefs/tags/2.0.2`);
    assert.throws(()=>publish(options,f.run),/tag/);assert.ok(!f.calls.some(c=>c[2]==='upload'));
});
test('channel changed during upload is caught before publication',()=>{
    const f=fake();let uploaded=false;
    assert.throws(()=>publish(options,(cmd,args)=>{if(args[1]==='upload')uploaded=true;if(uploaded&&args[0]==='api'&&args[1].includes('/releases/'))return JSON.stringify({...draft,prerelease:false});return f.run(cmd,args);}),/channel/);
    assert.ok(!f.calls.some(c=>c[2]==='edit'));
});
test('published matching release is no-op; does not resolve historical mutable branch',()=>{
    const f=fake({...draft,draft:false,target_commitish:'main',assets:options.assets});publish(options,f.run);assert.ok(!f.calls.some(c=>c[2]==='upload'||c[2]==='edit'||c[2]?.includes('/commits/')));
});
test('changed published assets fail; missing assets may be uploaded without clobber',()=>{
    assert.throws(()=>publish(options,fake({...draft,draft:false,assets:[{name:'main.js',size:3}]}).run),/differs/);
    const f=fake({...draft,draft:false});publish(options,f.run);assert.ok(!f.calls.find(c=>c[2]==='upload').includes('--clobber'));
});
test('network errors are not treated as absent releases',()=>{const f=fake(Object.assign(new Error('403'),{stderr:'HTTP 403'}));assert.throws(()=>publish(options,f.run),/403/);assert.ok(!f.calls.some(c=>c[2]==='create'));});
test('upload failure never publishes',()=>{const f=fake();assert.throws(()=>publish(options,(cmd,args)=>{if(args[1]==='upload')throw Error('upload failed');return f.run(cmd,args);}),/upload failed/);assert.ok(!f.calls.some(c=>c[2]==='edit'));});
test('stable intent remains explicit',()=>{const f=fake(nf());publish({...options,channel:'stable'},f.run);assert.ok(!f.calls.find(c=>c[2]==='create').includes('--prerelease'));});

test('removed artifact after upload stops draft publication',()=>{
 const f=fake();let uploaded=false;
 assert.throws(()=>publish(options,(cmd,args)=>{if(args[1]==='upload')uploaded=true;if(uploaded&&args[0]==='api'&&args[1].includes('/releases/'))return JSON.stringify(draft);return f.run(cmd,args);}),/asset/);
 assert.ok(!f.calls.some(c=>c[2]==='edit'));
});
test('post-publication concurrent mutation is detected, not claimed atomically prevented',()=>{
 const f=fake();let edited=false;
 assert.throws(()=>publish(options,(cmd,args)=>{if(args[1]==='edit')edited=true;if(edited&&args[0]==='api')return JSON.stringify({...draft,draft:false,assets:[]});return f.run(cmd,args);}),/asset/);
});

test('unexpected or duplicate assets fail closed',()=>{
 for(const assets of [[...options.assets,{name:'unknown.js'}],[...options.assets,...options.assets]]) assert.throws(()=>verifyAssets({...draft,assets},options.assets),/Unexpected/);
});
