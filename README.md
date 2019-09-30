# Exported functions to make testing a gulp plugin easy


## The main function which all the others call in to

Creates a stream that writes the file argument and **pipes through to the transform being tested**. Upon end or error will ensure that null files are passed through and for buffer/stream files will ensure they transformed to the same type ( Buffer=>Buffer, Stream=>Stream).  If these conditions are not met the promise rejects with GulpRuleError with the type property one of DidNotPassThroughNull,TransformedBufferToStreamOrNull,TransformedStreamToBufferOrNull.  If the conditions are met the expectation callback is called.  If the expectation throws the Promise is rejected with a PluginTestError.

``` typescript
export declare type GulpStream = NodeJS.ReadWriteStream;

export function pluginTest(
    gulpStream:GulpStream,
    file:File,
    expectation:(files:File[],error?:Error)=>void|Promise<void>
):Promise<void>
```

Examples for all functions at the end.

## Transform to single file test helper

These tests will throw if there is not a single transformed file.  The reason that there is a buffer and stream version is two fold.  Firstly, you can pass a string and the appropriate file will be created and if you provide a file it checks that you did indeed provide the appropriate file.  If you do not pass the appropriate file the function will reject.
																
These tests will call the expectation if there is an error, or if there is no error will provide the transformed file contents to the expectation. 

```typescript
type SingleTransformationExpectation = (
    transformedContents:string|undefined,
    originalFile:File,
    transformedFile:File|undefined,
    err?:Error)=>void

export function singleBufferTransformContentsTest(
    gulpStream:GulpStream,
    fileContentsOrBufferFile:string|File,
    expectation:SingleTransformationExpectation
):Promise<void>

export function singleStreamTransformContentsTest(
    gulpStream:GulpStream,
    fileContentsOrBufferFile:string|File,
    expectation:SingleTransformationExpectation
):Promise<void>
```

## Ignores / Filters

The ignoreFileTest function will resolve when the transform calls the callback without error and without changing the file.
The filtersFileTest function will resolve when the transform calls the callback without error or file argument.

``` typescript
export function ignoresFileTest(gulpStream:GulpStream,file:File):Promise<void>
export function filtersFileTest(gulpStream:GulpStream,file:File):Promise<void>
```
## Transforms with files

This function resolves when resolves and there are transformed files
```typescript
export function transformsWithFilesTest(gulpStream:GulpStream,file:File):Promise<void>

```
## File contents type

This will pass the plugin a file of the unsupported type, it will resolve if the plugin errors with an Error object. 

```typescript
export function throwsErrorOnUnsupportedContentTypeTest(gulpStream:GulpStream,streamNotSupported=true):Promise<void>
```

There is a stronger version of throwsErrorOnUnsupportedContentTypeTest.
To resolve your plugin needs to throw a PluginError with a BufferNotSupported property with value equal to the streamNotSupported argument.
The module 'th-gulpHelpers' exports the function cbErrorIfContentsTypeNotSupported that can be used for this functionality.


```typescript
export function throwsPluginErrorOnUnsupportedContentTypeTest(gulpStream:GulpStream,streamNotSupported=true):Promise<void>
```

## Example usage

Using jest.

```typescript 
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
```

## File helpers

```typescript
export function createStreamFile(streamContent:string,cb?:(file:File)=>void):File //StreamFile
export function createBufferFile(bufferContent:string,cb?:(file:File)=>void):File //BufferFile
export function createStreamOrBufferFile(content:string,isStream:boolean,cb?:(file:File)=>void):File

export enum FileType{Buffer,Stream,Null}
export function getFileType(file:File):FileType

export async function getFileContents(file:File):Promise<string|null>
```
