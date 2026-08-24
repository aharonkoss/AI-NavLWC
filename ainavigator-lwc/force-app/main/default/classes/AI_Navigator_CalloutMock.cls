/**
 * @description       : 
 * @author            : ChangeMeIn@UserSettingsUnder.SFDoc
 * @group             : 
 * @last modified on  : 07-02-2026
 * @last modified by  : ChangeMeIn@UserSettingsUnder.SFDoc
**/
@isTest
public class AI_Navigator_CalloutMock implements HttpCalloutMock {
    private Integer statusCode;
    private String responseBody;
    private Map<String, String> headers;

    public AI_Navigator_CalloutMock(Integer statusCode, String responseBody) {
        this.statusCode = statusCode;
        this.responseBody = responseBody;
        this.headers = new Map<String, String>{
            'Content-Type' => 'application/json',
            'X-Correlation-Id' => 'test-correlation-id'
        };
    }

    public HttpResponse respond(HttpRequest req) {
        HttpResponse res = new HttpResponse();
        res.setStatusCode(this.statusCode);
        res.setBody(this.responseBody);
        if (this.headers != null) {
            for (String key : this.headers.keySet()) {
                res.setHeader(key, this.headers.get(key));
            }
        }
        return res;
    }
}