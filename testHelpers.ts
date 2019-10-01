import * as intoStream from 'into-stream';
import { PluginError,FileContentsTypeNotSupportedError,File,GulpStream } from "th-gulphelpers";
import { getFileContents, createStreamOrBufferFile, FileType} from './fileHelpers'
import { getFileType } from './pluginTestHelpers';
const isEqual =  require('lodash.isequal');
const streamEqual = require('stream-equal');

function throwIf(predicate:()=>boolean){
    if(predicate()){
        throw new Error();
    }
}
function throwIfNotError(error:any,errorType:any){
    throwIf(()=>{
        return !(error&&error instanceof errorType);
    })
}

//#region content types
export function throwsErrorOnUnsupportedContentTypeTest(gulpStream:GulpStream,streamNotSupported=true){
    let file:File=createStreamOrBufferFile("some contents",streamNotSupported);
    return pluginTest(gulpStream,file,(files,error)=>{
        throwIfNotError(error,Error);
    })
}
//module th-gulpHelpers exports cbErrorIfContentsTypeNotSupported will throw with BufferNotSupported property
export function throwsPluginErrorOnUnsupportedContentTypeTest(gulpStream:GulpStream,streamNotSupported=true){
    let file:File=createStreamOrBufferFile("some contents",streamNotSupported);
    return pluginTest(gulpStream,file,(files,error)=>{
        throwIfNotError(error,PluginError);
        throwIf(()=>{
            return (error as PluginError<FileContentsTypeNotSupportedError>).BufferNotSupported===streamNotSupported;
        })
    })
}
//#endregion

export function transformsWithFilesTest(gulpStream:GulpStream,file:File){
    return pluginTest(gulpStream,file,(files,error)=>{
        throwIf(()=>!!error||files.length===0);
    });
}


//#region ignores/filters

export function ignoresFileTest(gulpStream:GulpStream,file:File){
    const isStream=file.isStream();
    //for property values changed / added / deleted
    const fileClone=file.clone();
    return pluginTest(gulpStream,file,async (files,error)=>{
        throwIf(()=>{
            const transformedFile=files[0];
            let throws = !!error||files.length!==1||transformedFile!==file;
            if(!throws){
                if(isStream){
                    const originalStream=fileClone.contents as NodeJS.ReadStream;
                    const transformedStream=transformedFile.contents as NodeJS.ReadStream;
                    delete fileClone._contents;
                    delete transformedFile._contents;
                    if(isEqual(fileClone,transformedFile)){
                        throws = !streamEqual(originalStream,transformedStream);
                    }else{
                        throws = true;
                    }
                }else{
                    throws = !isEqual(fileClone,transformedFile);
                }
            }
            return throws;
        })
    })
}


export function filtersFileTest(gulpStream:GulpStream,file:File){
    return pluginTest(gulpStream,file,(files,error)=>{
        throwIf(()=>!!error||files.length!==0);
    })
}
//#endregion

//#region helpers for asserting contents of single transform file as string, ensures Buffer->Buffer or Stream-Stream - can create file

type SingleTransformationExpectation = (transformedContents:string|undefined,originalFile:File,transformedFile:File|undefined,err?:Error)=>void

function singleTransformContentsTest(isStream:boolean,gulpStream:GulpStream,fileContentsOrFile:string|File,expectation:SingleTransformationExpectation){
    function getFileOrRejection(){
        function checkFileType(){
            if( typeof fileContentsOrFile!=='string'){
                const fileType=getFileType(fileContentsOrFile);
                if(isStream&&fileType!==FileType.Stream){
                    return Promise.reject(new Error("File must be a stream file."));
                }
                if(!isStream && fileType!==FileType.Buffer){
                    return Promise.reject(new Error("File must be a buffer file."));
                }
            }
        }
        const rejection=checkFileType();
        if(rejection){
            return rejection;
        }
        return typeof fileContentsOrFile==='string'?createStreamOrBufferFile(fileContentsOrFile,isStream):fileContentsOrFile;
    }
    const fileOrRejection=getFileOrRejection();
    if(fileOrRejection instanceof Promise){
        return fileOrRejection;
    }
    return pluginTest(gulpStream,fileOrRejection,async (files,error)=>{
        if(error){
            expectation(undefined,fileOrRejection,undefined,error);
        }else{
            if(files.length!==1){
                throw new Error("Expected one file");
            }
            const transformedFile=files[0];
            const transformedContents = await getFileContents(transformedFile)
            expectation(transformedContents as string,fileOrRejection,transformedFile);
        }
    });
}
export function singleBufferTransformContentsTest(gulpStream:GulpStream,fileContentsOrBufferFile:string|File,expectation:SingleTransformationExpectation){
    return singleTransformContentsTest(false,gulpStream,fileContentsOrBufferFile,expectation);
}

export function singleStreamTransformContentsTest(gulpStream:GulpStream,fileContentsOrStreamFile:string|File,expectation:SingleTransformationExpectation){
    return singleTransformContentsTest(true,gulpStream,fileContentsOrStreamFile,expectation);
}
//#endregion

//******************* The function that all other test expectations call into

type FilesChecker=(files:File[])=>GulpRuleErrorType;

export enum GulpRuleErrorType{None,DidNotPassThroughNull,TransformedBufferToStreamOrNull,TransformedStreamToBufferOrNull};

export class GulpRuleError extends Error{
    constructor(public type:GulpRuleErrorType){
        super();
        this.message=this.getErrorMessage();
    }
    private getTransformedContentsIncorrectlyMessage(originalStream:boolean){
        const from=originalStream?"Stream":"Buffer or Null";
        const to=originalStream?"Buffer":"Stream or Null";
        return `Transformed contents incorrectly - ${from} -> ${to}`;
    }
    private getErrorMessage(){
        switch(this.type){
            case GulpRuleErrorType.DidNotPassThroughNull:
                return "Did not pass through null file";
            case GulpRuleErrorType.TransformedBufferToStreamOrNull:
                return this.getTransformedContentsIncorrectlyMessage(false);
            case GulpRuleErrorType.TransformedStreamToBufferOrNull:
                return this.getTransformedContentsIncorrectlyMessage(true);
            /* istanbul ignore next */
            default:
                throw new Error("unsupported enum")
        }
    }
}
export class PluginTestError extends Error{
    constructor(){
        super("Plugin test failed")
    }
}
export function pluginTest(gulpStream:GulpStream,file:File,expectation:(files:File[],error?:Error)=>void|Promise<void>){
    function getFilesChecker():FilesChecker{
        const fileType=getFileType(file);
        if(fileType==FileType.Null){
            const nullClone=file.clone();
            return (files:File[])=>{
                let fails=false;
                if(files.length!==1){
                    fails=true;
                }else{
                    const transformedFile = files[0];
                    fails = !isEqual(nullClone,transformedFile);
                }
                return fails?GulpRuleErrorType.DidNotPassThroughNull:GulpRuleErrorType.None;
            }
        }
        const isStream=fileType==FileType.Stream;
        return (files:File[])=>{
            let fails=false;
            for(let i=0;i<files.length;i++){
                const tfFileType=getFileType(files[i]);
                if(tfFileType!==fileType){
                    fails=true;
                    break;
                }
            }
            return fails?(isStream?GulpRuleErrorType.TransformedStreamToBufferOrNull:GulpRuleErrorType.TransformedBufferToStreamOrNull):GulpRuleErrorType.None;
        }
    }
    const filesChecker=getFilesChecker();
    
    return new Promise<void>(function(resolve, reject){
        function complete(){
            setImmediate(async ()=>{
                const errorType=filesChecker(files);
                if(errorType!==GulpRuleErrorType.None){
                    return reject(new GulpRuleError(errorType));
                }
                try{
                    await expectation(files,error);
                }catch(e){
                    return reject(new PluginTestError());
                }
                resolve();
            })
            
        }
        const files:File[]=[]
        let error:Error;
        
        gulpStream.on('data',function(file:File){
            files.push(file);
        });
    
        gulpStream.on('end',()=>{
            complete();
        })
        
        gulpStream.on('error',(e)=>{
            error=e;
            complete();
        })
    
    
        intoStream.object(file).pipe(gulpStream);
    })
}
