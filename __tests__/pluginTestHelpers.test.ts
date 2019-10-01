import * as PluginHelpers from '../pluginTestHelpers';
import { createBufferFile, createStreamFile, getFileContents } from '../fileHelpers';
import { pluginTest, Transform } from '../pluginTestHelpers';
import { GulpRuleError, GulpRuleErrorType, PluginTestError } from "../testHelpers";
import { TransformCallback, cbErrorIfContentsTypeNotSupported, File } from 'th-gulphelpers';
import fromString =require( 'from2-string');

export interface PluginHelperTransformOptions{
    bufferUnsupported:boolean,
    streamUnsupported:boolean,
}
type FileTransformer=(file:File)=>File[];
let fileTransformer:FileTransformer|undefined;

let gulpTransformError:Error|undefined
export class GulpTransform extends Transform {
    constructor(private options:PluginHelperTransformOptions){
        super({objectMode:true})
    }
    _transform(file:File,encoding:string,cb:TransformCallback){
        const threw=cbErrorIfContentsTypeNotSupported("GulpTransform",file,cb,this.options.bufferUnsupported,this.options.streamUnsupported);
        if(threw) return;

        fileTransformer!(file).forEach((f)=>this.push(f));
        
        if(gulpTransformError){
            cb(gulpTransformError);
        }else{
            cb();
        }
        
    }
}
function createBothSupportedTransform(){
    return new GulpTransform({bufferUnsupported:false,streamUnsupported:false})
}
describe('plugin helper',()=>{
    beforeEach(()=>{
        gulpTransformError=undefined;
        fileTransformer=undefined;
    })
    async function expectPluginTestError(actual:Promise<unknown>){
        await expect(actual).rejects.toThrowError(PluginTestError);
    }
    async function expectGulpRuleError(actual:Promise<unknown>,type:GulpRuleErrorType){
        await expect(actual).rejects.toThrowError(GulpRuleError);
        await expect(actual).rejects.toHaveProperty('type',type);
    }
    async function expectDidNotPassThroughNull(actual:Promise<unknown>){
        await expectGulpRuleError(actual,GulpRuleErrorType.DidNotPassThroughNull);
    }
    describe('pluginTest',()=>{
        describe('Gulp rule rejections',()=>{
            describe('null file',()=>{
                it('should call the expectation if null file is ignored',async ()=>{
                    const expectation=jest.fn();
                    fileTransformer=f=>[f];
                    const gt=createBothSupportedTransform();
                    await PluginHelpers.pluginTest(gt,new PluginHelpers.File(),expectation);
                    expect(expectation).toHaveBeenCalled();
                })
                describe('GulpError type DidNotPassThroughNull',()=>{
                    describe('0 or more files',()=>{
                        it("should fail when 0 files", ()=>{
                            fileTransformer=f=>[];
                            const gt=createBothSupportedTransform();
                            return expectDidNotPassThroughNull(
                                PluginHelpers.pluginTest(gt,new PluginHelpers.File(),()=>{})
                            );
                        })
                        it("should fail when more than one file", ()=>{
                            fileTransformer=f=>[f,new File()];
                            const gt=createBothSupportedTransform();
                            return expectDidNotPassThroughNull(
                                PluginHelpers.pluginTest(gt,new PluginHelpers.File(),()=>{}));
                        })
                    })
                    describe('changes',()=>{
                        it('should fail when contents is changed to non null',()=>{
                            fileTransformer=f=>{
                                f.contents=fromString("");
                                return [f];
                            }
                            const gt=createBothSupportedTransform();
                            return expectDidNotPassThroughNull(
                                PluginHelpers.pluginTest(gt,new PluginHelpers.File(),()=>{}));
                        })
                        describe("file property changes",()=>{
                            it('should fail when new prop is added to file', ()=>{
                                fileTransformer=f=>{
                                    f.newProp="Some value";
                                    return [f];
                                }
                                const gt=createBothSupportedTransform();
                                return expectDidNotPassThroughNull(
                                    PluginHelpers.pluginTest(gt,new PluginHelpers.File(),()=>{}));
                            })
                            it('should fail when file property is changed', ()=>{
                                const file = new PluginHelpers.File();
                                file.changeProp="Original";
                                fileTransformer=f=>{
                                    f.changeProp="Changed";
                                    return [f];
                                }
                                const gt=createBothSupportedTransform();
                                return expectDidNotPassThroughNull(
                                    PluginHelpers.pluginTest(gt,file,()=>{}));
                            })
                            it('should fail when file property is deleted',()=>{
                                const file = new PluginHelpers.File();
                                file.deleteProp="Original";
                                fileTransformer=f=>{
                                    delete f.deleteProp;
                                    return [f];
                                }
                                const gt=createBothSupportedTransform();

                                return expectDidNotPassThroughNull(
                                    PluginHelpers.pluginTest(gt,file,()=>{}));
                            })
                        })
                    })
                })
            })
            describe('transformed to incorrect contents type',()=>{
                it('should throw GulpError type TransformedBufferToStream when transform buffer file to a stream file', ()=>{
                    fileTransformer=f=>[createStreamFile("")];
                    const gt=createBothSupportedTransform();
                    return expectGulpRuleError(
                        PluginHelpers.pluginTest(gt,createBufferFile(""),()=>{}),GulpRuleErrorType.TransformedBufferToStreamOrNull)
                })
                it('should throw GulpError type TransformedStreamToBuffer when transform stream file to a buffer file', ()=>{
                    fileTransformer=f=>[createBufferFile("")];
                    const gt=createBothSupportedTransform();
                    return expectGulpRuleError(
                        PluginHelpers.pluginTest(gt,createStreamFile(""),()=>{}),GulpRuleErrorType.TransformedStreamToBufferOrNull)
                });
                it('should throw GulpError type TransformedBufferToStream when transform buffer file to many files where one is a stream file', ()=>{
                    fileTransformer=f=>[f,createStreamFile("")];
                    const gt=createBothSupportedTransform();
                    return expectGulpRuleError(
                        PluginHelpers.pluginTest(gt,createBufferFile(""),()=>{}),GulpRuleErrorType.TransformedBufferToStreamOrNull)
                })
            })
        })
        describe('calling the expectation',()=>{
            it("should call the expectation with any successful transformed files and error when errors",async ()=>{
                gulpTransformError=new Error("This should be a PluginError");
                const newBufferFile=createBufferFile("");
                fileTransformer=f=>[newBufferFile];
                const gt=createBothSupportedTransform();

                const expectation=jest.fn();
                await pluginTest(gt,createBufferFile("original"),expectation);
                const expectationCallArguments=expectation.mock.calls[0];
                const transformedFiles=expectationCallArguments[0];

                expect(expectationCallArguments[1]).toBe(gulpTransformError);
                expect(transformedFiles.length).toBe(1);
                expect(transformedFiles[0]).toBe(newBufferFile);
            })
            it("should call the expectation with transformed files and no errors when completes successfully",async ()=>{
                const expectation=jest.fn();
                const newBufferFile1=createBufferFile("");
                const newBufferFile2=createBufferFile("");
                fileTransformer=f=>[newBufferFile1,newBufferFile2];
                const gt=createBothSupportedTransform();

                await pluginTest(gt,createBufferFile("original"),expectation);
                const transformedFiles=expectation.mock.calls[0][0];
                expect(expectation.mock.calls[0][1]).toBeUndefined();
                expect(transformedFiles.length).toBe(2);
                expect(transformedFiles[0]).toBe(newBufferFile1);
                expect(transformedFiles[1]).toBe(newBufferFile2);
            })
            it("should reject when expectation throws", ()=>{
                fileTransformer=f=>[f];
                const gt=createBothSupportedTransform();

                const expectation=()=>{
                    throw new Error("_")
                }
                return expectPluginTestError(
                    pluginTest(gt,createBufferFile("original"),expectation))
                
            })
            it("should reject when expectation rejects", ()=>{
                fileTransformer=f=>[f];
                const gt=createBothSupportedTransform();
                const expectation=()=>Promise.reject(new Error("_"))
                return expectPluginTestError(
                    pluginTest(gt,createBufferFile("original"),expectation));
                
            })
            it("should not reject when the expectation passes",()=>{
                fileTransformer=f=>[f];
                const gt=createBothSupportedTransform();
                const expectation=()=>Promise.resolve();
                return pluginTest(gt,createBufferFile("original"),expectation);
            })
        })
        describe('example usage',()=>{
            describe("My Hello World Gulp Plugin",()=>{
                class GulpHelloWorld extends Transform {
                    constructor(){
                        super({objectMode:true})
                    }
                    async _transform(file:File,encoding:string,cb:TransformCallback){
                        const threw=cbErrorIfContentsTypeNotSupported("GulpHelloWorld",file,cb,false,true);
                        if(threw) return;
                        
                        const fileContents=await getFileContents(file);
                        switch(fileContents){
                            case "hello":
                                file.contents=Buffer.from("hello world");
                                this.push(file);
                                break;
                            case "hello hello":
                                file.contents=Buffer.from("hello world");
                                this.push(file);
                                const clone=file.clone();
                                clone.contents=Buffer.from("hello world");
                                this.push(clone);
                                break;
                            case "goodbye":
                                break;
                            default:
                                this.push(file);
                                break; 
                        }
                        cb();
                        
                    }
                }
                
                it("should accept buffers only",()=>{
                    return PluginHelpers.throwsPluginErrorOnUnsupportedContentTypeTest(new GulpHelloWorld(),true);
                })
                
                it("should pass through null files",()=>{
                    return PluginHelpers.pluginTest(new GulpHelloWorld(),new File(),()=>{});
                })
                it("should transform buffer to buffer", ()=>{
                    return PluginHelpers.pluginTest(new GulpHelloWorld(),createBufferFile(""),()=>{});
                })
                it("should append world if contents are hello",()=>{
                    return PluginHelpers.singleBufferTransformContentsTest(new GulpHelloWorld(),"hello",(contents)=>{
                        expect(contents).toEqual("hello world");
                    });
                })
                it("should transform with files if hello hello",()=>{
                    return PluginHelpers.transformsWithFilesTest(new GulpHelloWorld(),createBufferFile("hello hello"));
                })
                it("should create two hello world if hello hello",()=>{
                    return PluginHelpers.pluginTest(new GulpHelloWorld(),createBufferFile("hello hello"),async (files,error)=>{
                        expect(files.length).toBe(2);
                        const file1Contents = await getFileContents(files[0]);
                        const file2Contents = await getFileContents(files[1]);
                        expect(file1Contents).toBe("hello world");
                        expect(file2Contents).toBe("hello world");
                    });
                })
                it("should filter goodbye",()=>{
                    return PluginHelpers.filtersFileTest(new GulpHelloWorld(),createBufferFile("goodbye"));
                })
                it("should ignore all other text",()=>{
                    return PluginHelpers.ignoresFileTest(new GulpHelloWorld(),createBufferFile("ignore"));
                })
                
            })
        })
        
    })
    describe('unsupported content type',()=>{
        it('should pass throwsPluginErrorOnUnsupportedContentType when buffer unsupported', ()=>{
            const gt=new GulpTransform({bufferUnsupported:true,streamUnsupported:false})
            return PluginHelpers.throwsPluginErrorOnUnsupportedContentTypeTest(gt,false);
        })
        it('should fail throwsPluginErrorOnUnsupportedContentType when buffer supported', ()=>{
            fileTransformer=f=>[f];
            const gt=new GulpTransform({bufferUnsupported:false,streamUnsupported:false});
            return expectPluginTestError(
                PluginHelpers.throwsPluginErrorOnUnsupportedContentTypeTest(gt,false));
        })
    
        it('should pass throwsPluginErrorOnUnsupportedContentType when stream unsupported', ()=>{
            const gt=new GulpTransform({bufferUnsupported:false,streamUnsupported:true})
            return PluginHelpers.throwsPluginErrorOnUnsupportedContentTypeTest(gt);
        });
        it('should fail throwsPluginErrorOnUnsupportedContentType when stream supported', ()=>{
            fileTransformer=f=>[f];
            const gt=new GulpTransform({bufferUnsupported:false,streamUnsupported:false})
            return expectPluginTestError(
                PluginHelpers.throwsPluginErrorOnUnsupportedContentTypeTest(gt,true));
        });

        it('should pass throwsErrorOnUnsupportedContentType when buffer unsupported',()=>{
            const gt=new GulpTransform({bufferUnsupported:true,streamUnsupported:false})
            return PluginHelpers.throwsPluginErrorOnUnsupportedContentTypeTest(gt,false);
        })
        it('should fail throwsErrorOnUnsupportedContentType when buffer supported', ()=>{
            fileTransformer=f=>[f];
            const gt=new GulpTransform({bufferUnsupported:false,streamUnsupported:false})
            return expectPluginTestError(
                PluginHelpers.throwsErrorOnUnsupportedContentTypeTest(gt,false));
        })
    
        it('should pass throwsErrorOnUnsupportedContentType when stream unsupported',()=>{
            const gt=new GulpTransform({bufferUnsupported:false,streamUnsupported:true})
            return PluginHelpers.throwsErrorOnUnsupportedContentTypeTest(gt);
        });
        it('should fail throwsErrorOnUnsupportedContentType when stream supported', ()=>{
            fileTransformer=f=>[f];
            const gt=new GulpTransform({bufferUnsupported:false,streamUnsupported:false})
            return expectPluginTestError(
                PluginHelpers.throwsErrorOnUnsupportedContentTypeTest(gt));
        });
    })
    describe('transformsWithFilesTest',()=>{
        it('should pass when no error and a single file of correct type', ()=>{
            fileTransformer=f=>[f];
            const gt=createBothSupportedTransform();
            return PluginHelpers.transformsWithFilesTest(gt,PluginHelpers.createBufferFile("some content"));
        });
        it('should pass when no error and multiple files of correct type', ()=>{
            fileTransformer=f=>[f,createBufferFile("")];
            const gt=createBothSupportedTransform();
            return PluginHelpers.transformsWithFilesTest(gt,PluginHelpers.createBufferFile("some content"));
        });
        it('should fail if error', ()=>{
            fileTransformer=f=>[];
            gulpTransformError = new Error();
            const gt=createBothSupportedTransform();
            return expectPluginTestError(PluginHelpers.transformsWithFilesTest(gt,PluginHelpers.createBufferFile("some content")));
        });
        it('should fail if any file transforms to incorrect file contents type', ()=>{
            fileTransformer=f=>[f,createStreamFile("")];
            const gt=createBothSupportedTransform();
            gulpTransformError = new Error();
            return expectGulpRuleError(
                PluginHelpers.transformsWithFilesTest(gt,PluginHelpers.createBufferFile("some content")),GulpRuleErrorType.TransformedBufferToStreamOrNull)
        });
        
    })
    describe('filters / ignores',()=>{
        describe('ignoresFile',()=>{
            [true,false].forEach((isStream)=>{
                it('should pass ignoresFile when a file is ignored', ()=>{
                    fileTransformer=f=>[f];
                    const gt=createBothSupportedTransform();
                    return PluginHelpers.ignoresFileTest(gt,PluginHelpers.createStreamOrBufferFile("Some text",isStream));
                })
            });
            describe("failing ignoresFile tests",()=>{
                describe('contents change',()=>{
                    it('should fail ignoresFile when contents is a new stream',()=>{
                        fileTransformer=f=>{
                            f.content=fromString("Some text");
                            return [f];
                        }
                        const gt=createBothSupportedTransform();
                        return expectPluginTestError(
                            PluginHelpers.ignoresFileTest(gt,PluginHelpers.createStreamFile("Some text")));
                    })
                    it('should fail ignoresFile when contents is a new buffer', ()=>{
                        fileTransformer=f=>{
                            f.content=Buffer.from("Some text");
                            return [f];
                        }
                        const gt=createBothSupportedTransform();
                        return expectPluginTestError(
                            PluginHelpers.ignoresFileTest(gt,PluginHelpers.createBufferFile("Some text")));
                    })
                    it('should fail ignoresFile when buffer is written to', ()=>{
                        fileTransformer=f=>{
                            const buffer=(f.contents as Buffer);
                            buffer.write("overwrite",1);
                            return [f];
                        }
                        const gt=createBothSupportedTransform();
                        return expectPluginTestError(
                            PluginHelpers.ignoresFileTest(gt,PluginHelpers.createBufferFile("Some text")));
                    })
                    //https://github.com/gulpjs/vinyl#optionscontents
                    //stream is a readable stream - so no stream equivalent test of above

                    it('should fail ignoresFile when file contents is changed from null',()=>{
                        fileTransformer=f=>{
                            f.content=fromString("Some text");
                            return [f];
                        }
                        const gt=createBothSupportedTransform();
                        return expectDidNotPassThroughNull(
                            PluginHelpers.ignoresFileTest(gt,new PluginHelpers.File()));
                    })
                    it('should fail ignoresFile when file contents is set to null', ()=>{
                        fileTransformer=f=>{
                            f.contents=null;
                            return [f];
                        }
                        const gt=createBothSupportedTransform();
                        return expectGulpRuleError(
                            PluginHelpers.ignoresFileTest(gt,PluginHelpers.createBufferFile("some contents")),GulpRuleErrorType.TransformedBufferToStreamOrNull);
                    })
                })

                describe("file property changes",()=>{
                    it('should fail ignoresFile when new prop is added to file', ()=>{
                        fileTransformer=f=>{
                            f.newProp="Some value";
                            return [f];
                        }
                        const gt=createBothSupportedTransform();
                        return expectPluginTestError(
                            PluginHelpers.ignoresFileTest(gt,PluginHelpers.createBufferFile("Some text")));
                    })
                    it('should fail ignoresFile when file property is changed', ()=>{
                        fileTransformer=f=>{
                            f.changeProp="Changed";
                            return [f];
                        }
                        const gt=createBothSupportedTransform();
                        return expectPluginTestError(
                            PluginHelpers.ignoresFileTest(gt,PluginHelpers.createBufferFile("Some text",(f=>f.changeProp="Original"))));
                    })
                    it('should fail ignoresFile when file property is deleted',()=>{
                        fileTransformer=f=>{
                            delete f.deleteProp;
                            return [f];
                        }
                        const gt=createBothSupportedTransform();
                        return expectPluginTestError(
                            PluginHelpers.ignoresFileTest(gt,PluginHelpers.createBufferFile("Some text",(f=>f.deleteProp="Original"))));
                    })
                })
            })
        });
        describe("filtersFile",()=>{
            it('should pass filtersFile when a file is filtered', ()=>{
                fileTransformer=f=>[];
                const gt=createBothSupportedTransform();
                return PluginHelpers.filtersFileTest(gt,PluginHelpers.createBufferFile("Some text"));
            });
            it('should fail filtersFile when a file is not filtered', ()=>{
                fileTransformer=f=>[f];
                const gt=createBothSupportedTransform();
                return expectPluginTestError(
                    PluginHelpers.filtersFileTest(gt,PluginHelpers.createBufferFile("Some text")));
            });
        })
    })
    describe('singleTransformContentsTest',()=>{
        describe('singleBufferTransformContentsTest',()=>{
            describe('failure before expectation',()=>{
                it('should fail when multiple files', ()=>{
                    fileTransformer=f=>[f,createBufferFile("")];
                    const gt=createBothSupportedTransform();
                    return expectPluginTestError(
                        PluginHelpers.singleBufferTransformContentsTest(gt,"Some content",()=>{}));
                })
                it('should fail if transformed to stream', ()=>{
                    fileTransformer=f=>[createStreamFile("")];
                    const gt=createBothSupportedTransform();
                    return expectGulpRuleError(
                        PluginHelpers.singleBufferTransformContentsTest(gt,PluginHelpers.createBufferFile("Some content"),()=>{}),GulpRuleErrorType.TransformedBufferToStreamOrNull);
                })
                it('should fail if pass incorrect file type ( instead of using a string )',()=>{
                    const gt=createBothSupportedTransform();
                    return expect(PluginHelpers.singleBufferTransformContentsTest(
                        gt,PluginHelpers.createStreamFile("Some content"),()=>{})).rejects.toThrow('File must be a buffer file.');
                    
                })
            })
            
            describe('calling the expectation', ()=>{
                it("should call the expectation with the transformed file contents, file and transformed file when completes",async ()=>{
                    const transformedContentsAsString="Transformed"
                    const transformedFile=createBufferFile(transformedContentsAsString);
                    fileTransformer=f=>[transformedFile];
                    const gt=createBothSupportedTransform();

                    const expectation=jest.fn();
                    const file = PluginHelpers.createBufferFile("Some content");
                    await PluginHelpers.singleBufferTransformContentsTest(gt,file,expectation)

                    const expectationCallArgs = expectation.mock.calls[0];
                    expect(expectationCallArgs[0]).toEqual(transformedContentsAsString);
                    expect(expectationCallArgs[1]).toBe(file);
                    expect(expectationCallArgs[2]).toBe(transformedFile);
                    expect(expectationCallArgs[3]).toBe(undefined);
                })
                
                it('should pass when expectation passes', ()=>{
                    fileTransformer=f=>[f];
                    const gt=createBothSupportedTransform();
                    return PluginHelpers.singleBufferTransformContentsTest(gt,PluginHelpers.createBufferFile("Some content"),(contents,file,error)=>{
                        //pass
                    });
                })
                it('should fail when expectation fails', ()=>{
                    fileTransformer=f=>[f];
                    const gt=createBothSupportedTransform();
                    return expectPluginTestError(
                        PluginHelpers.singleBufferTransformContentsTest(gt,PluginHelpers.createBufferFile("Some content"),(contents,file,error)=>{
                            throw new Error("Fails")
                    }));
                })
                it("should call the expectation with the file and the error when errors",async ()=>{
                    fileTransformer=()=>[]
                    gulpTransformError=new Error();
                    const gt=createBothSupportedTransform();
                    const file = PluginHelpers.createBufferFile("Some content");
                    const expectation=jest.fn();
                    await PluginHelpers.singleBufferTransformContentsTest(gt,file,expectation)

                    const expectationCall = expectation.mock.calls[0];
                    expect(expectationCall[0]).toBeUndefined();
                    expect(expectationCall[1]).toBe(file);
                    expect(expectationCall[2]).toBeUndefined();
                    expect(expectationCall[3]).toBe(gulpTransformError);
                })
            })
            
        })
        describe('singleStreamTransformContentsTest',()=>{
            describe('failure before expectation',()=>{
                it('should fail when multiple files', ()=>{
                    fileTransformer=f=>[f,createStreamFile("")];
                    const gt=createBothSupportedTransform();
                    return expectPluginTestError(
                        PluginHelpers.singleStreamTransformContentsTest(gt,"Some content",()=>{}));
                })
                it('should fail if transformed to buffer', ()=>{
                    fileTransformer=f=>[f,createBufferFile("")];
                    const gt=createBothSupportedTransform();
                    return expectGulpRuleError(
                        PluginHelpers.singleStreamTransformContentsTest(gt,PluginHelpers.createStreamFile("Some content"),()=>{}),GulpRuleErrorType.TransformedStreamToBufferOrNull);
                })
                it('should fail if pass incorrect file type ( instead of using a string )',()=>{
                    const gt=createBothSupportedTransform();
                    return expect(PluginHelpers.singleStreamTransformContentsTest(
                        gt,PluginHelpers.createBufferFile("Some content"),()=>{})).rejects.toThrow('File must be a stream file.');
                    
                })
                
            })
            describe('calling the expectation',()=>{
                //could replicate all the tests done in singleBufferTransformContentsTest
                //but given that is common code...
                it("should call the expectation with the transformed file contents, file and transformed file when completes",async ()=>{
                    const transformedContentsAsString="Transformed"
                    const transformedFile=createStreamFile(transformedContentsAsString);
                    fileTransformer=f=>[transformedFile];
                    const gt=createBothSupportedTransform();

                    const expectation=jest.fn();
                    const file = PluginHelpers.createStreamFile("Some content");
                    await PluginHelpers.singleStreamTransformContentsTest(gt,file,expectation)

                    const expectationCallArgs = expectation.mock.calls[0];
                    expect(expectationCallArgs[0]).toEqual(transformedContentsAsString);
                    expect(expectationCallArgs[1]).toBe(file);
                    expect(expectationCallArgs[2]).toBe(transformedFile);
                    expect(expectationCallArgs[3]).toBe(undefined);
                })
                it('should pass when expectation passes', ()=>{
                    fileTransformer=f=>[f];
                    const gt=createBothSupportedTransform();
                    return PluginHelpers.singleStreamTransformContentsTest(gt,PluginHelpers.createStreamFile("Some content"),(contents,file,error)=>{
                        //pass
                    });
                })
                it('should fail when expectation fails', ()=>{
                    fileTransformer=f=>[f];
                    const gt=createBothSupportedTransform();
                    return expectPluginTestError(
                        PluginHelpers.singleStreamTransformContentsTest(gt,PluginHelpers.createStreamFile("Some content"),(contents,file,error)=>{
                        throw new Error();
                    }));
                })
            })
        })
    })
})