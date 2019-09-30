import { File } from "th-gulphelpers";
import fromString =require( 'from2-string');
import streamToString = require('stream-to-string');

//createStreamFile is specifically for tests as is using from2-string - READABLE STREAM
//note that cannot expose the specific type due to the vinyl definition file
export function createStreamFile(streamContent:string,cb?:(file:File)=>void){
    var fakeFile = new File({
        contents: fromString(streamContent)
    });
    if(cb){
        cb(fakeFile);
    }
    return fakeFile as File;
}
export function createBufferFile(bufferContent:string,cb?:(file:File)=>void){
    var fakeFile = new File({
        contents: Buffer.from(bufferContent)
    });
    if(cb){
        cb(fakeFile);
    }
    return fakeFile as File;
}
export function createStreamOrBufferFile(content:string,isStream:boolean,cb?:(file:File)=>void){
    return isStream?createStreamFile(content,cb):createBufferFile(content,cb);
}
export enum FileType{Buffer,Stream,Null}
export function getFileType(file:File):FileType{
    if(file.isBuffer()){
        return FileType.Buffer;
    }
    if(file.isStream()){
        return FileType.Stream;
    }
    return FileType.Null;
}

export async function getFileContents(file:File){
    if(file.isBuffer()){
        return file.contents.toString("utf8");
    }
    if(file.isStream()){
        return await streamToString(file.contents);
    }
    return null;
}
